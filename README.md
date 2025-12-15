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

## Navigation links

The links in the top navigation menu are ordered by their `weight` attribute. This defaults to `100` (from `content/_data/weight.json`), which means that pages *without* a weight will appear after items with a `weight` less than 100. The sort order for items of the same weight is unspecified, so if you want a particular ordering, set the weight values as appropriate.

## Data-driven content

The list of races in [content/races/races.yaml](content/races/races.yaml) is used to the drive the generation of several pages:

- The race schedule (`/races`)
- An [iCalendar] file containing all the races (`/races/races.ics`)
- Individual race pages (`/race/foolsdual`)
- Individual iCalendar files for each race (`/race/foolsdual/race.ics`)

Each race entry contains the following information:

- `title` -- this is the full name of the event
- `slug` -- a shortened version of the title used in URL paths
- `sheet` -- link to an embeddable Google Docs spreadsheet with the event staffing
- `date` -- the date of the event
- `location` -- the city and state in which the event is located
- `url` -- URL of the YuKanRun page for the event

Additionally, some content depends on the presence of specific files:

- `content/race/<slug>/<slug>.pdf` -- a map of the event
- `content/race/<slug>/<slug>.gpx` -- a GPX track for the event

[icalendar]: https://en.wikipedia.org/wiki/ICalendar
