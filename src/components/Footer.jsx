import React from 'react'

import styles from './Footer.module.scss'

export default () =>
  <div className={styles.footer}>
    powered by{' '}
    <a target="_blank"
       rel="noopener noreferrer"
       href="https://www.gatsbyjs.org">
      @gatsbyjs
    </a>
  </div>
