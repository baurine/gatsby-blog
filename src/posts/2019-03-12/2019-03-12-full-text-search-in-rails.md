---
title: "在 Rails 中使用 PostgreSQL 进行 full text search 的一些总结"
date: "2019-03-12"
tags: [rails, full text search, postgresql]
---

参考：

- [Optimizing Full Text Search with Postgres tsvector Columns and Triggers](https://thoughtbot.com/blog/optimizing-full-text-search-with-postgres-tsvector-columns-and-triggers) 
- [Chapter 12. Full Text Search](https://www.postgresql.org/docs/9.5/textsearch-features.html)
- [pg_search Building indexes](https://github.com/Casecommons/pg_search/wiki/Building-indexes)

对在 Rails 中使用 PostgreSQL 进行 full text search 进行一些总结。

一般来说，我们在 Rails 中进行简单的 full text search，都会直接用 [pg_search](https://github.com/Casecommons/pg_search) 这个 gem，给 model 加上相应的 `pg_search_scope`。

比如说我现在有一个 episodes 的 table，有 title 和 description 两列，我要通过 title 或 description 进行全文搜索，我们一般会在 Episode model 加上下面的代码：

    include PgSearch
    pg_search_scope :search_by_title,
                    against: :title,
                    using: {
                      tsearch: {
                        prefix: true,
                      }
                    }
    pg_search_scope :search_by_desc,
                    against: :description,
                    using: {
                      tsearch: {
                        prefix: true,
                      }
                    }

如果这个表很小的话，比如记录只有几千条或数万条，执行 `Episode.search_by_title(...)` 或 `Episode.search_by_desc(...)` 一般性能上没有什么问题，但是如果这个表很大的话，比如几十万或数百万条，性能就会变得很差，在我们的项目中，一百万条记录的表，上面两个方法需要数十秒甚至几分钟才有结果返回。因为每次搜索都要实时执行 `to_tsvector(title)` 或 `to_tsvector(description)`，将 title 或 description 列 (string 类型) 转换成 tsvector 类型，比如将 "hello world baurine" 转换成 "baurine:0 hello: 1 world:2"，由于记录过多，这个过程会很慢。

// 此处待补充 `Episode.search_by_title()` 方法 explain 后的输出，从输出中可以看到 `to_tsvector()` 方法的执行

因此，我们可以做以下工作：

1. 将 `to_tsvector()` 转换后的结果缓存下来，所以我们可以新增一列 (此例中我们要新增两列)，类型为 tsvector，它存储 `to_tsvector(title)` 和 `to_tsvector(description)` 的结果
1. 对新增加的 tsvector 列增加索引，以加快搜索速度
1. 当更新 episode 的 title 或 description 时，对应的 tsvector 列也需要更新，因此还需要创建触发器，监听 title 或 description 变化时，更新相应的 tsvector 列

于是我们按照 `pg_search` wiki 上的[指南](https://github.com/Casecommons/pg_search/wiki/Building-indexes)，为这两列创建 tsvector 列及增加索引和触发器，索引使用 gin，注意这个 migrate 无法自动 rollback，所以要手动实现 down 方法。

    class AddTsvectorToEpisodes < ActiveRecord::Migration[5.0]
      def up
        add_column :episodes, :tsv_title, :tsvector
        add_index  :episodes, :tsv_title, using: 'gin'

        say_with_time("Adding trigger function on episodes for updating tsv_title column") do
          sql = <<-MIGRATION
            CREATE TRIGGER tsv_for_ep_title BEFORE INSERT OR UPDATE
            ON episodes FOR EACH ROW EXECUTE PROCEDURE
            tsvector_update_trigger(tsv_title, 'pg_catalog.simple', title);
          MIGRATION
          execute(sql)
        end

        add_column :episodes, :tsv_description, :tsvector
        add_index  :episodes, :tsv_description, using: 'gin'

        say_with_time("Adding trigger function on episodes for updating tsv_description column") do
          sql = <<-MIGRATION
            CREATE TRIGGER tsv_for_ep_description BEFORE INSERT OR UPDATE
            ON episodes FOR EACH ROW EXECUTE PROCEDURE
            tsvector_update_trigger(tsv_description, 'pg_catalog.simple', description);
          MIGRATION
          execute(sql)
        end
      end

      def down
        execute <<-SQL
          DROP TRIGGER tsv_for_ep_description ON episodes;
          DROP TRIGGER tsv_for_ep_title ON episodes;
        SQL

        remove_index :episodes, :tsv_description
        remove_column :episodes, :tsv_description

        remove_index :episodes, :tsv_title
        remove_column :episodes, :tsv_title
      end
    end

执行 migrate 后还要手动对每一个 episode 执行 touch 或 save 操作，使之更新 `tsv_title` 和 `tsv_description` 两列的内容。

同时，修改 model 的 `pg_search_scope` 方法：

    include PgSearch
    pg_search_scope :search_by_title,
                    against: :title,
                    using: {
                      tsearch: {
                        prefix: true,
                        tsvector_column: 'tsv_title'
                      }
                    }
    pg_search_scope :search_by_desc,
                    against: :description,
                    using: {
                      tsearch: {
                        prefix: true,
                        tsvector_column: 'tsv_description'
                      }
                    }

通过 `tsvector_coloumn` 参数从指定的列搜索，而无需再实时执行 `to_tsvector()` 方法进行转换。

对 `Episode.search_by_title()` 方法进行 explain 后可以发现确实没有执行 `to_tsvector()` 方法，而且可以发现索引被使用。

    [1] pry(main)> Episode.search_by_title('adventure').explain
      Episode Load (85.9ms)  SELECT "episodes".* FROM "episodes" INNER JOIN (SELECT "episodes"."id" AS pg_search_id, (ts_rank(("episodes"."tsv_title"), (to_tsquery('simple', ''' ' || 'adventure' || ' ''' || ':*')), 2)) AS rank FROM "episodes" WHERE ((("episodes"."tsv_title") @@ (to_tsquery('simple', ''' ' || 'adventure' || ' ''' || ':*'))))) AS pg_search_a8ace1a76c218f36a59a58 ON "episodes"."id" = pg_search_a8ace1a76c218f36a59a58.pg_search_id ORDER BY pg_search_a8ace1a76c218f36a59a58.rank DESC, "episodes"."id" ASC
    => EXPLAIN for: SELECT "episodes".* FROM "episodes" INNER JOIN (SELECT "episodes"."id" AS pg_search_id, (ts_rank(("episodes"."tsv_title"), (to_tsquery('simple', ''' ' || 'adventure' || ' ''' || ':*')), 2)) AS rank FROM "episodes" WHERE ((("episodes"."tsv_title") @@ (to_tsquery('simple', ''' ' || 'adventure' || ' ''' || ':*'))))) AS pg_search_a8ace1a76c218f36a59a58 ON "episodes"."id" = pg_search_a8ace1a76c218f36a59a58.pg_search_id ORDER BY pg_search_a8ace1a76c218f36a59a58.rank DESC, "episodes"."id" ASC
                                                  QUERY PLAN
    ---------------------------------------------------------------------------------------------------------
    Sort  (cost=4050.16..4051.01 rows=341 width=1513)
      Sort Key: (ts_rank(episodes_1.tsv_title, '''adventure'':*'::tsquery, 2)) DESC, episodes.id
      ->  Nested Loop  (cost=34.96..4035.81 rows=341 width=1513)
            ->  Bitmap Heap Scan on episodes episodes_1  (cost=34.54..1306.26 rows=327 width=103)
                  Recheck Cond: (tsv_title @@ '''adventure'':*'::tsquery)
                  ->  Bitmap Index Scan on index_episodes_on_tsv_title  (cost=0.00..34.45 rows=327 width=0)
                        Index Cond: (tsv_title @@ '''adventure'':*'::tsquery)
            ->  Index Scan using episodes_pkey on episodes  (cost=0.42..8.34 rows=1 width=1509)
                  Index Cond: (id = episodes_1.id)
    (9 rows)

如此操作之后，搜索速度大为改进，一般情况下数秒返回结果，好的时候几百毫秒返回结果 (取决于搜索字符串长度，越短越慢)。

然后，新的需求来了，需要同时对 title 和 description 两列内容进行全文搜索。`pg_search` 的文档上介绍说有一种简便的办法，`pg_search_scope` 是这么写：

    pg_search_scope :search_by_title_desc,
                    against: [:title, :description],
                    using: {
                      tsearch: {
                        prefix: true,
                        tsvector_column: %w(tsv_title tsv_description)
                      }
                    }

通过 `tsvector_column` 同时指定对应的两列 tsvector 列。同样，如果表不大，这种方法是可以的，但如果表很大，虽然我们单独对 `tsv_title` 和 `tsv_description` 加了索引，但没有对它们的联合内容加索引，速度依旧很慢。

所以我们要对 title 和 description 两列联合的内容，进行和上面一样的处理：加新列，加索引，加触发器。而且考虑到 title 比 description 具有更高的优先级，我们还要对两列进行不同的权值处理，可以使用 setweight 方法。

最终的实现代码：

    class AddFullTextIndexOnEpisodes < ActiveRecord::Migration[5.0]
      def up
        add_column :episodes, :tsv_title_desc, :tsvector
        add_index  :episodes, :tsv_title_desc, using: 'gin'

        # https://www.postgresql.org/docs/9.5/textsearch-features.html
        say_with_time("Adding trigger function on episodes for updating tsv_title_desc column") do
          sql = <<-MIGRATION
            DROP FUNCTION IF EXISTS title_desc_trigger();
            CREATE FUNCTION title_desc_trigger() RETURNS trigger AS $$
            begin
              new.tsv_title_desc :=
                setweight(to_tsvector('pg_catalog.simple', coalesce(new.title,'')), 'A') ||
                setweight(to_tsvector('pg_catalog.simple', coalesce(new.description,'')), 'D');
              return new;
            end
            $$ LANGUAGE plpgsql;

            CREATE TRIGGER tsv_for_ep_title_desc BEFORE INSERT OR UPDATE
            ON episodes FOR EACH ROW EXECUTE PROCEDURE title_desc_trigger();
          MIGRATION
          execute(sql)
        end
      end

      def down
        execute <<-SQL
          DROP TRIGGER tsv_for_ep_title_desc
          ON episodes;
          DROP FUNCTION title_desc_trigger();
        SQL

        remove_index :episodes, :tsv_title_desc
        remove_column :episodes, :tsv_title_desc
      end
    end

修改 model 的 `pg_search_scope`:

    pg_search_scope :search_by_title_desc,
                    against: [:title, :description],
                    using: {
                      tsearch: {
                        prefix: true,
                        tsvector_column: 'tsv_title_desc'
                      }
                    }

最后，还要一个需要注意的地方，注意到上面 `to_tsvector()` 和 `tsvector_update_trigger()` 方法中都有一个 `pg_catalog.simple` 的参数，我大致知道是用来设置语言的，但不明白具体是怎么起作用的，中途有一个把它改成了 `pg_catalog.english` 后，发现搜索时只能搜索到包含英文的结果，其它语言 (比如法语和中文) 的内容无法搜索到。所以 `pg_catalog.simple` 表示可以支持所有语言。
