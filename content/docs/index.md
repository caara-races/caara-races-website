---
title: Documentation
tags: page
---

{% for page in collections.docs -%}
- [{{ page.data.short_title | default: page.data.title }}]({{ page.url }})
{% endfor %}
