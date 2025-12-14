# Cape Anne Amateur Radio Association Race & Event Support

This repository is an example of how to use a static site generator like [Eleventy] to maintain a website for the [CAARA] Race & Event Support organization.

[eleventy]: https://www.11ty.dev/
[caara]: https://caara.net/

## Generate the site

Ensure that you have previously installed the prerequisites:

```
npm install
```

To generate the site content, run:

```
npm run build
```

This will populate the `_site` directory with the site content.

## Notes on navigation links

The links in the top navigation menu are ordered by their `weight` attribute. This defaults to `100` (from `content/_data/weight.json`), which means that pages *without* a weight will appear after items with a `weight` less than 100. The sort order for items of the same weight is unspecified, so if you want a particular ordering, set the weight values as appropriate.
