---
title: Documentation
tags: page
---

<!-- markdownlint-disable MD032 MD052 -->

## CAARA Documentation

{% assign sorted = collections.docs | sort: 'data.title' %}
{% for doc in sorted -%}
- [{{ doc.data.title }}]({{ doc.url }})
{% endfor -%}
- [Communication log (pdf)](communication_log.pdf)

## Additional sources of information

- [ARES Field Resources Manual](https://www.arrl.org/files/file/ARES_FR_Manual.pdf)

  "A Quick Trainer and Field Resource Guide for the Emergency Communicator"

- [Ham Radio Boston Docs & Videos](https://www.hamradioboston.org/docs-videos)

  Ham Radio Boston represents the amateur radio operators who assist with the BAA Marathon (and Half Marathon).
