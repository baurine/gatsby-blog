import React from 'react'
import { Link, StaticQuery, graphql } from "gatsby"
import styles from './BasicLayout.module.css'

const ListLink = ({ to, children }) => (
  <li className={styles.nav_link}>
    <Link to={to}>{children}</Link>
  </li>
)

const HeaderNav = ({ title }) => (
  <header className={styles.nav_header}>
    <Link to="/">
      <h3 className={styles.nav_header_heading}>{title}</h3>
    </Link>
    <ul className={styles.nav_header_list}>
      <ListLink to="/">Home</ListLink>
      <ListLink to="/about/">About</ListLink>
    </ul>
  </header>
)

const Layout = ({ data, children }) => (
  <div className={styles.container}>
    <HeaderNav title={data.site.siteMetadata.title}/>
    { children }
  </div>
)

export default ({ children }) => (
  <StaticQuery
    query={graphql`
      query {
        site {
          siteMetadata {
            title
          }
        }
      }
    `}
    render={data => <Layout data={data}>{children}</Layout>}
  />
)
