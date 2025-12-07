---
title: Race Schedule
tags: page
layout: page
weight: 10
---

<table id="race_schedule">
<tr><th>#</th><th>Date</th><th>Description</th><th>Start time</th><th>Location</th></tr>
{% for race in collections.race %}
  <tr>
    <td>{{ forloop.index }}</td>
    <td>{{ race.date | date: "%b %d (%a)", "UTC"}}</td>
    <td><a href="{{ race.url }}">{{ race.data.title }}</a></td>
    <td>{{ race.data.start_time }}</td>
    <td>{{ race.data.location }}</td>
  </tr>
{% endfor %}
</table>

