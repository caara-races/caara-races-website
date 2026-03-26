---
title: About this site
---

This repository contains the sources for a proposed version of the [CAARA] race support website build using the [Eleventy] static site generator. The website uses data driven content to generate multiple, always consistent views of the annual race schedule. The sources are managed in a [git] repository hosted on [GitHub], offering robust change tracking and accountability.

[eleventy]: https://www.11ty.dev/
[caara]: https://caara.net/

## What is a static site generator?

Quoting [Wikipedia]:

[wikipedia]: https://en.wikipedia.org/wiki/Static_site_generator

> Static site generators (SSGs) are software engines that use text input files
> (such as Markdown, reStructuredText, AsciiDoc and JSON) to generate static
> web pages. Unlike dynamic websites, these static pages do not change based
> on the request. This simplifies the requirements for the backend and allows
> the site to be distributed via content delivery networks (CDNs). The simple
> design also makes it harder for attackers to modify the website due to the
> smaller attack surface of these relatively simple backends.

## Why use a static site generator?

Because the website is built entirely from a collection of static files, serving it requires very few resources. Free web site hosting, complete with custom domains and free SSL certificates, can be found from a variety of providers, including:

- [GitHub]
- [Firebase]
- [Netlify]
- ...and many, many others.

[github]: https://docs.github.com/en/pages
[Firebase]: https://firebase.google.com/
[Netlify]: https://netlify.com

Generating and serving static content has several advantages:

- Static sites are significantly faster than traditional dynamic websites
  because they serve pre-built HTML files directly, without database queries or
  server-side processing. This means information loads instantly for visitors.
- You can host the website on your own computer while developing
  content, making it easy to see changes before they are published.

## Why use git/GitHub?

[Git] is a version control system, originally designed for software development but with applications in many other fields. Using a version control system, we have a log of all the changes made to a set of files, making it easy to answer questions like:

- When was this project last updated?
- Who made a particular change (and why did they make it)?
- What content was changed? What did it look like before the change was made?

It also enables multiple people to collaborate on a project. In fact, it can allow *anyone* to collaborate on a project, and provides a mechanism by which someone from outside the organization can propose changes directly. If the project administrators think the changes make sense, they can simply approve and accept them and they are immediately incorporated into the project. If information is ever erroneously modified or deleted, the previous content can always be restored from the project's change history.

[GitHub] is a git hosting provider. In addition to basic repository hosting services, they offer in-browser editing, static page hosting, and a variety of other services.

## What is data driven content?

Information about the race season is stored in individual markdown files using [YAML frontmatter]. This allows us to generate several different views of that data, including:

[yaml frontmatter]: https://www.11ty.dev/docs/data-frontmatter/

- [The overall race schedule](https://caara-races.oddbit.com/races/)
- [An iCalendar file of the overall schedule](https://caara-races.oddbit.com/races/races.ics), allowing you to import the schedule into Google Calendar, Outlook, etc.
- Individual race web pages, such as [this one for the Fool's Dual Half Marathon](https://caara-races.oddbit.com/race/foolsdual/)
- iCalendar files for individual races, such as [this one for the Fool's Dual Half Marathon](https://caara-races.oddbit.com/race/foolsdual/race.ics)

Because all of these views are generated automatically, they are always in sync. There's never any concern that information about an event will differ in different places.

## Additional benefits

Beyond the specific advantages already discussed, the approach described in this document offers several other important benefits:

- **Platform independence**: Website content is stored in standard file formats (YAML, Markdown) that are not locked to any proprietary system. This means you can switch hosting providers, tools, or technologies without being trapped by vendor-specific formats. Contributors do not require proprietary applications in order to edit the content.

- **Offline capability**: Contributors can work on content without an internet connection and sync their changes later.

- **Minimal maintenance**: There are no software updates to install, no database patches to apply, and no server security updates to manage. The website requires virtually no ongoing technical maintenance.

## How accessible is it?

One of the key advantages of this approach is its accessibility to contributors of all skill levels.

### Option 1: Using your browser

Because the sources for the site are hosted on [GitHub], we can use their web interface for editing files. On any page, click on the "Suggest changes" link at the bottom. This will open an editor in your browser allowing to edit the page source. No special software is required - just a web browser. Depending on your permissions, you will either be able to save the changes directly, or propose the changes for approval by a site administrator.

### Option 2: On your computer

For those with more technical expertise, you can obtain a copy of the sources to edit them locally using the [git] command line tool or one of the many GUI interfaces to the tool, including the support built into the [VS Code] editor. This approach allows you to work offline and sync your changes later.

[git]: https://git-scm.com/
[vs code]: https://code.visualstudio.com/

This flexibility means that both technical and non-technical contributors can participate effectively, with a low barrier to entry for anyone who wants to contribute content to the website.
