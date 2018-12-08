import React from 'react'
import { Link, StaticQuery, graphql } from "gatsby"
import Footer from '../components/Footer'
import styles from './BasicLayout.module.scss'

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
      <li className={styles.nav_link}>
        <a href="https://github.com/baurine"
           target="_blank"
           rel="noopener noreferrer">
          GitHub
        </a>
      </li>
    </ul>
  </header>
)

const Layout = ({ data, children }) => (
  <div className={styles.container}>
    <HeaderNav title={data.site.siteMetadata.title}/>
    <div className={styles.content_container}>
      { children }
    </div>
    <Footer/>
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
