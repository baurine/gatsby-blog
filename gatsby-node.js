const path = require('path')

// input: 2018-10-02-uninterrupted-audio-player-turbolinks
// output: /2018/10/02/uninterrupted-audio-player-turbolinks/
const convertNameToPath = (name) => {
  const arr = name.split('-')
  const path1 = arr.slice(0, 3).join('/')
  const path2 = arr.slice(3).join('-')
  return `/${path1}/${path2}/`
}

exports.onCreateNode = ({ node, getNode, actions }) => {
  if (node.internal.type === `MarkdownRemark`) {
    // node.parent is an id
    // `getNode(nodeId)` finds Node by id
    // MarkdownRemark node's parent should be a File Node which has some fileds likes name/relativePath ...
    const parentFileNode = getNode(node.parent)
    const fileName = parentFileNode.name
    // console.log(parentFileNode.name)
    // output: 2018-10-02-uninterrupted-audio-player-turbolinks
    // I will use this name to generate the page slug and path
    // the path will be /2018/10/02/uninterrupted-audio-player-turbolinks/ to be compatible with old url link
    const { createNodeField } = actions
    createNodeField({
      node,
      name: `slug`,
      value: convertNameToPath(fileName)
    })
  }
}

exports.createPages = ({ graphql, actions }) => {
  const { createPage } = actions
  return new Promise((resolve, reject) => {
    graphql(`
      query {
        allMarkdownRemark {
          edges {
            node {
              fields {
                slug
              }
            }
          }
        }
      }
    `)
    .then(result => {
      // console.log(JSON.stringify(result, null, 2))
      result.data.allMarkdownRemark.edges.forEach(({ node }) => {
        const slug = node.fields.slug
        createPage({
          path: slug,
          component: path.resolve('./src/templates/blog-post.js'),
          context: { 
            slug
          }
        })
      })
      resolve()
    })
  })
}
