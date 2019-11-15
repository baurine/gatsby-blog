import React from "react";

export default () => (
  <section>
    <h3>Comments</h3>
    <div
      ref={elem => {
        if (!elem) {
          return;
        }
        const scriptElem = document.createElement("script");
        scriptElem.src = "https://utteranc.es/client.js";
        scriptElem.async = true;
        scriptElem.crossOrigin = "anonymous";
        scriptElem.setAttribute("repo", "baurine/gatsby-blog");
        scriptElem.setAttribute("issue-term", "pathname");
        scriptElem.setAttribute("label", "blog-comment");
        scriptElem.setAttribute("theme", "github-light");
        elem.appendChild(scriptElem);
      }}
    />
  </section>
);
