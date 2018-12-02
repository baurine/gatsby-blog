import React from "react"
import { graphql } from 'gatsby'
import BasicLayout from "../layouts/BasicLayout"
import styles from './index.module.css'

export default ({ data }) => 
  <BasicLayout>
    <ul className={styles.post_list}>
      {
        data.allMarkdownRemark.edges.map(({ node }) => (
          <li key={node.id}>
            <p
              className={styles.post_title}>
              {node.frontmatter.title}{" "}
              <span
                className={styles.post_date}>
                — {node.frontmatter.date}
              </span>
            </p>
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
          }
        }
      }
    }
  }
`
