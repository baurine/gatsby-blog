import React from "react"
import { graphql, Link } from 'gatsby'
import BasicLayout from "../layouts/BasicLayout"
import styles from './index.module.scss'

export default ({ data }) => 
  <BasicLayout>
    <ul className={styles.post_list}>
      {
        data.allMarkdownRemark.edges
          .filter(({ node }) => node.frontmatter.published !== false)
          .map(({ node }) => (
            <li key={node.id}>
              <Link to={node.fields.slug}
                    style={{textDecoration: 'none',
                            color: 'inherit',
                            fontWeight: 'normal'}}>
                <p className={styles.post_title}>
                  {node.frontmatter.title}{" "}
                  <span
                    className={styles.post_date}>
                    — {node.frontmatter.date}
                  </span>
                </p>
              </Link>
            </li>
        ))
      }
    </ul>
  </BasicLayout>

export const query = graphql`
  query {
    allMarkdownRemark(
      sort: { fields: [frontmatter___date], order: DESC }
    ) {
      edges {
        node {
          id
          frontmatter {
            title
            date(formatString: "MMMM DD, YYYY")
            published
          }
          fields {
            slug
          }
        }
      }
    }
  }
`
