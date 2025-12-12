---
title: Race Schedule
tags: page
layout: page
weight: 10
---

<p class="noprint"><a href="races.ics">Add to calendar</a></p>

{% assign sorted_races = races | sort: 'date' %}

<table class="race-schedule">
<thead>
<tr><th scope="col">#</th><th scope="col">Date</th><th scope="col">Description</th><th scope="col">Start time</th><th scope="col">Location</th></tr>
</thead>
<tbody>
{% for race in sorted_races %}
  <tr>
    <td>{{ forloop.index }}</td>
    <td>{{ race.date | date: "%b %d (%a)" }}</td>
    <td><a href="/race/{{ race.title | slugify }}">{{ race.title }}</a></td>
    <td>{{ race.date | date: "%H:%M %p" }}</td>
    <td>{{ race.location }}</td>
  </tr>
{% endfor %}
</tbody>
</table>

