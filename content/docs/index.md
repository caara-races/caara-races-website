---
title: Documentation
tags: page
---

<ul>
{% for page in collections.docs %}
  <li><a href="{{ page.url }}">{{ page.data.short_title | default: page.data.title }}</a></li>
{% endfor %}
</ul>
