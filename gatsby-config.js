module.exports = {
  siteMetadata: {
    title: `Baurine's Blog`,
  },
  plugins: [
    {
      resolve: `gatsby-source-filesystem`,
      options: {
        name: `posts`,
        path: `${__dirname}/src/posts`,
      },
    },
    // `gatsby-transformer-remark`,
    {
      resolve: `gatsby-transformer-remark`,
      options: {
        plugins: [
          "gatsby-remark-copy-linked-files",
          // {
          //   resolve: "gatsby-remark-copy-linked-files",
          //   options: {
          //     // `ignoreFileExtensions` defaults to [`png`, `jpg`, `jpeg`, `bmp`, `tiff`]
          //     // as we assume you'll use gatsby-remark-images to handle
          //     // images in markdown as it automatically creates responsive
          //     // versions of images.
          //     //
          //     // If you'd like to not use gatsby-remark-images and just copy your
          //     // original images to the public directory, set
          //     // `ignoreFileExtensions` to an empty array.
          //     // ignoreFileExtensions: [],
          //   }
          // },
          {
            resolve: `gatsby-remark-images`,
            options: {
              // It's important to specify the maxWidth (in pixels) of
              // the content container as this plugin uses this as the
              // base for generating different widths of each image.
              maxWidth: 590,
            },
          },
          `gatsby-remark-autolink-headers`
        ],
      },
    },
    {
      resolve: `gatsby-plugin-typography`,
      options: {
        pathToConfigModule: `src/utils/typography.js`,
      },
    },
    `gatsby-plugin-sharp`, // depedent by `gatsby-remark-imags`
  ],
}
