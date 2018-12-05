import React from "react"
import BasicLayout from "../layouts/BasicLayout"
import { graphql } from "gatsby"

export default ({ data }) => {
  const post = data.markdownRemark
  return (
    <BasicLayout>
      <div style={{marginTop: '4rem'}}>
        <h1>{post.frontmatter.title}</h1>
        <span>{post.frontmatter.date}</span>
        <br/>
        <br/>
        <div dangerouslySetInnerHTML={{__html: post.html}}/>
      </div>
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
