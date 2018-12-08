import React from "react"
import BasicLayout from "../layouts/BasicLayout"
import { graphql } from "gatsby"

import '../styles/main.scss'
import styles from './blog-post.module.scss'

export default ({ data }) => {
  const post = data.markdownRemark
  return (
    <BasicLayout>
      <div className={styles.post_head}>
        <h1>{post.frontmatter.title}</h1>
        <span>{post.frontmatter.date}</span>
      </div>
      <hr/>
      <div dangerouslySetInnerHTML={{__html: post.html}}/>
      <hr/>
    </BasicLayout>
  )
}

export const query = graphql`
  query($slug: String!) {
    markdownRemark(fields: { slug: { eq: $slug } }) {
      html
      frontmatter {
        title
        date(formatString: "MMMM DD, YYYY")
      }
    }
  }
`
