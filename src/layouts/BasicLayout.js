import React from 'react'
import { Link } from "gatsby"
import styles from './BasicLayout.module.css'

const ListLink = ({to, children}) => (
  <li className={styles.nav_link}>
    <Link to={to}>{children}</Link>
  </li>
)

const HeaderNav = () => (
  <header className={styles.nav_header}>
    <Link to="/">
      <h3 className={styles.nav_header_heading}>Baurine's Blog</h3>
    </Link>
    <ul className={styles.nav_header_list}>
      <ListLink to="/">Home</ListLink>
      <ListLink to="/about/">About</ListLink>
    </ul>
  </header>
)

export default ({ children }) => (
  <div className={styles.container}>
    <HeaderNav/>
    { children }
  </div>
)
