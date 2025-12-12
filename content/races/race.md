---
pagination:
  data: races
  size: 1
  alias: race
permalink: /race/{{ race.title | slugify }}/
eleventyComputed:
  title: "{{ race.title }}"
layout: race
---


