---
title: Documentation
tags: page
---

<!-- markdownlint-disable MD032 MD052 -->

## CAARA Documentation

{% assign sorted = collections.docs | sort: 'data.title' %}
{% for doc in sorted -%}
- [{{ doc.data.title }}]({{ doc.url }})
{% endfor %}

## Additional sources of information

- [Collin County ARES](https://www.collinares.net/public-service)

  This page has a great deal of information relating to [ARES], public service, and emergency communications.

  [ares]: https://www.arrl.org/ares

- [ARES Field Resources Manual](https://www.arrl.org/files/file/ARES_FR_Manual.pdf)

  "A Quick Trainer and Field Resource Guide for the Emergency Communicator"

- [Ham Radio Boston Docs & Videos](https://www.hamradioboston.org/docs-videos)

  Ham Radio Boston represents the amateur radio operators who assist with the BAA Marathon (and Half Marathon).
