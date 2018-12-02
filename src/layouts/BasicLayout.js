import React from 'react'
import styles from './BasicLayout.module.css'

export default ({ children }) => (
  <div className={styles.container}>
    { children }
  </div>
)
