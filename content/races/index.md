---
title: Race Schedule
tags: page
layout: page
weight: 10
---

{% assign sorted_races = races | sort: 'date' %}

<table id="race_schedule">
<tr><th>#</th><th>Date</th><th>Description</th><th>Start time</th><th>Location</th></tr>
{% for race in sorted_races %}
  <tr>
    <td>{{ forloop.index }}</td>
    <td>{{ race.date | date: "%b %d (%a)", "UTC"}}</td>
    <td><a href="/race/{{ race.title | slugify }}">{{ race.title }}</a></td>
    <td>{{ race.start_time }}</td>
    <td>{{ race.location }}</td>
  </tr>
{% endfor %}
</table>

