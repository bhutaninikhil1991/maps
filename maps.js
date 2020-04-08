const width = 960;
const height = 600;
const urls = {
  basemap: "https://data.sfgov.org/resource/xfcw-9evu.geojson",
  streets: "https://data.sfgov.org/resource/3psu-pn9h.geojson?$limit=20000",
  cases: "https://data.sfgov.org/resource/vw6y-z8j6.json"
};
// const radiusStep = 0.1,
//   nodeRadius = 12; // Max radius if node is free of collision
// calculate date range
const end = d3.timeDay(new Date(2020, 2, 31));
const start = d3.timeDay(new Date(2020, 2, 1));
const format = d3.timeFormat("%Y-%m-%dT%H:%M:%S");
console.log(format(start), format(end));

var div = d3.select("body #d3ImplementationSection .container").append("div")
  .attr("class", "tooltip")
  .style("opacity", 0);

// add parameters to arrests url
urls.cases += "?$where=starts_with(service_name, 'Street and Sidewalk Cleaning')";
urls.cases += " AND starts_with(status_description, 'Open')";
urls.cases += " AND requested_datetime between '" + format(start) + "'";
urls.cases += " and '" + format(end) + "'";

// output url before encoding
console.log(urls.cases);

// encode special characters
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURI
urls.cases = encodeURI(urls.cases);
console.log(urls.cases);

const svg = d3.select("body").select("svg#vis");

var color = d3.scaleOrdinal(d3.schemeCategory10);


const g = {
  basemap: svg.select("g#basemap"),
  streets: svg.select("g#streets"),
  outline: svg.select("g#outline"),
  cases: svg.select("g#cases"),
  tooltip: svg.select("g#tooltip"),
  details: svg.select("g#details")
};


svg.call(d3.zoom().extent([
    [0, 0],
    [width, height]
  ])
  .scaleExtent([1, 8]).on("zoom", function() {
    svg.attr("transform", d3.event.transform)
  }))

// setup tooltip (shows neighborhood name)
const tip = g.tooltip.append("text").attr("id", "tooltip");
tip.attr("text-anchor", "end");
tip.attr("dx", -5);
tip.attr("dy", -5);
tip.style("visibility", "hidden");

var nodes = {};

// add details widget
// https://bl.ocks.org/mbostock/1424037
const details = g.details.append("foreignObject")
  .attr("id", "details")
  .attr("width", width)
  .attr("height", height)
  .attr("x", 0)
  .attr("y", 0);

const body = details.append("xhtml:body")
  .style("text-align", "left")
  .style("background", "none")
  .html("<p>N/A</p>");

details.style("visibility", "hidden");

// setup projection
// https://github.com/d3/d3-geo#geoConicEqualArea
const projection = d3.geoConicEqualArea();
projection.parallels([37.692514, 37.840699]);
projection.rotate([122, 0]);

// setup path generator (note it is a GEO path, not a normal path)
const path = d3.geoPath().projection(projection);

d3.json(urls.basemap).then(function(json) {
  // makes sure to adjust projection to fit all of our regions
  projection.fitSize([width, height], json);

  // draw the land and neighborhood outlines
  drawBasemap(json);

  // now that projection has been set trigger loading the other files
  // note that the actual order these files are loaded may differ
  d3.json(urls.streets).then(drawStreets);
  d3.json(urls.cases).then(drawCases);
});

function drawBasemap(json) {
  console.log("basemap", json);

  const basemap = g.basemap.selectAll("path.land")
    .data(json.features)
    .enter()
    .append("path")
    .attr("d", path)
    .attr("class", "land");

  const outline = g.outline.selectAll("path.neighborhood")
    .data(json.features)
    .enter()
    .append("path")
    .attr("d", path)
    .attr("class", "neighborhood")
    // .style("stroke", "black")
    // .style("stroke-width", 0.5)
    .each(function(d) {
      // save selection in data for interactivity
      // saves search time finding the right outline later
      d.properties.outline = this;
    });

  // add highlight
  basemap.on("mouseover.highlight", function(d) {
      d3.select(d.properties.outline).raise();
      d3.select(d.properties.outline).classed("active", true);
    })
    .on("mouseout.highlight", function(d) {
      d3.select(d.properties.outline).classed("active", false);
    });

  // add tooltip
  basemap.on("mouseover.tooltip", function(d) {
      tip.text(d.properties.nhood);
      tip.style("visibility", "visible");
    })
    .on("mousemove.tooltip", function(d) {
      const coords = d3.mouse(g.basemap.node());
      tip.attr("x", coords[0]);
      tip.attr("y", coords[1]);
    })
    .on("mouseout.tooltip", function(d) {
      tip.style("visibility", "hidden");
    });
}

function drawStreets(json) {
  console.log("streets", json);

  // only show active streets
  const streets = json.features.filter(function(d) {
    return d.properties.active;
  });

  console.log("removed", json.features.length - streets.length, "inactive streets");

  g.streets.selectAll("path.street")
    .data(streets)
    .enter()
    .append("path")
    .attr("d", path)
    .attr("class", "street");
}

function drawCases(json) {
  console.log("cases", json);
  nodes = json;
  // loop through and add projected (x, y) coordinates
  // (just makes our d3 code a bit more simple later)
  json.forEach(function(d) {
    const latitude = parseFloat(d.lat);
    const longitude = parseFloat(d.long);
    const pixels = projection([longitude, latitude]);
    d.collided = false;
    d.x = pixels[0];
    d.y = pixels[1];
    d.r = 5;
  });

  // while (json.filter(function(n) {
  //     return n.collided;
  //   }).length < json.length) {
  //   tick();
  // }

  //console.log(nodes);

  const symbols = g.cases.selectAll("circle")
    .data(json)
    .enter()
    .append("circle")
    .attr("cx", d => d.x)
    .attr("cy", d => d.y)
    .attr("r", d => d.r)
    .attr("class", "symbol")
    .style("fill", function(d) {
      return color(d.source);
    });
  //.style('stroke', 'black');

  symbols.on("mouseover", function(d) {
    if (d3.select(this).classed('hidden'))
      return;

    d3.select(this).raise();
    d3.select(this).classed("active", true);
    showLabel(d);
    // use template literal for the detail table
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals
    const html = `
  <table border="0" cellspacing="0" cellpadding="2">
  <tbody>
    <tr>
      <th>Request Date:</th>
      <td>${new Date(d.requested_datetime).toLocaleString()}</td>
    </tr>
    <tr>
      <th>Request Status:</th>
      <td>${d.status_description}</td>
    </tr>
    <tr>
      <th>Neighborhood:</th>
      <td>${d.neighborhoods_sffind_boundaries}</td>
    </tr>
    <tr>
      <th>Request Type:</th>
      <td>${d.service_subtype}</td>
    </tr>
    <tr>
      <th>Request Details:</th>
      <td>${d.service_details}</td>
    </tr>
    <tr>
      <th>Request Source:</th>
      <td>${d.source}</td>
    </tr>
  </tbody>
  </table>
`;

    body.html(html);
    details.style("visibility", "hidden");
  });

  symbols.on("mousemove", moveLabel);

  symbols.on("mouseout", function(d) {
    d3.select(this).classed("active", false);
    details.style("visibility", "hidden");
    hideLabel();
  });
}

function translate(x, y) {
  return "translate(" + String(x) + "," + String(y) + ")";
}

/*draw legend*/
var legendFullWidth = 200;
var legendFullHeight = 200;

var legendMargin = {
  top: 20,
  bottom: 20,
  left: 20,
  right: 20
};

var legendWidth = legendFullWidth - legendMargin.left - legendMargin.right;
var legendHeight = legendFullHeight - legendMargin.top - legendMargin.bottom;

var legendSvg = d3.select('#legend-svg')
  .attr('width', legendFullWidth)
  .attr('height', legendFullHeight)
  .append('g')
  .attr('transform', 'translate(' + 0 + ',' +
    legendMargin.top + ')');

d3.json(urls.cases).then(source).then(function(data) {
  var legend = legendSvg.selectAll(".legend")
    .data(data)
    .enter().append("g")
    .attr("class", "legend")
    .attr("transform", function(d, i) {
      return "translate(0," + i * 20 + ")";
    });

  legend.append("text")
    .attr("x", legendWidth - 24)
    .attr("y", 10)
    .style("text-anchor", "end")
    .text(function(d) {
      return d;
    });

  legend.append("rect")
    .attr("x", legendWidth - 18)
    .attr("width", 18)
    .attr("height", 18)
    .style("fill", function(d) {
      return color(d);
    }).on("click", function(d) {
      filtersource(d);
      const legendCell = d3.select(this);
      legendCell.classed('hidden', !legendCell.classed('hidden')); // toggle opacity of legend item
    });

})


legendSvg.append("text")
  .attr("class", "label")
  .attr("x", legendWidth - 30)
  .attr("y", -10)
  .attr("dy", ".15em")
  .style("font-size", 14)
  .attr("text-anchor", "middle")
  .text("Request Source");

function filtersource(c) {
  //let c = d3.select(this).text();
  d3.selectAll("#vis circle")
    .filter(function(d) {
      return d.source != c;
    }).classed('hidden', function() { // toggle "hidden" class
      return !d3.select(this).classed('hidden');
    });

  d3.selectAll("#vis circle")
    .filter(function(d) {
      return d.source == c;
    }).each(function(d) {
      var sel = d3.select(this);
      sel.moveToFront();
    })
}

function source(json) {
  let out = [];
  json.forEach(function(d) {
    out.push(d.source);
  });
  return d3.set(out.map(function(d) {
    return d;
  })).values();
}

// function tick() {
//   nodes.forEach(collided);
//
//   nodes.forEach(function(n) {
//     if (!n.collided) {
//       n.r += radiusStep;
//       if (n.r > nodeRadius) {
//         n.r = nodeRadius;
//         n.collided = true;
//       }
//     }
//   });
//
// }

d3.selection.prototype.moveToFront = function() {
  return this.each(function() {
    this.parentNode.appendChild(this);
  });
};

// function collided(node, i) {
//   if (node.collided) return;
//
//   nodes.forEach(function(n, j) {
//     if (n !== node) {
//       var dx = node.x - n.x,
//         dy = node.y - n.y,
//         l = Math.sqrt(dx * dx + dy * dy);
//
//       if (l < node.r + n.r) {
//         node.collided = true;
//         n.collided = true;
//       }
//     }
//   });
// }

function showLabel(d) {
  var coords = [d3.event.clientX, d3.event.clientY];
  var top = coords[1] - d3.select("#d3ImplementationSection").node().getBoundingClientRect().y + 30,
    left = coords[0] - d3.select("#d3ImplementationSection").node().getBoundingClientRect().x + 15;

  const html = `
  <table border="0" cellspacing="0" cellpadding="2">
  <tbody>
    <tr>
      <th>Request Date:</th>
      <td class="text">${new Date(d.requested_datetime).toLocaleString()}</td>
    </tr>
    <tr>
      <th>Request Status:</th>
      <td class="text">${d.status_description}</td>
    </tr>
    <tr>
      <th>Neighborhood:</th>
      <td class="text">${d.neighborhoods_sffind_boundaries}</td>
    </tr>
    <tr>
      <th>Request Type:</th>
      <td class="text">${d.service_subtype}</td>
    </tr>
    <tr>
      <th>Request Details:</th>
      <td class="text">${d.service_details}</td>
    </tr>
    <tr>
      <th>Request Source:</th>
      <td class="text">${d.source}</td>
    </tr>
  </tbody>
  </table>
`;
  div.transition()
    .duration(200)
    .style("opacity", 1);
  div.html(html)
    .style("top", top + "px")
    .style("left", left + "px");
}

function moveLabel() {
  var coords = [d3.event.clientX, d3.event.clientY];

  var top = coords[1] - d3.select("#d3ImplementationSection").node().getBoundingClientRect().y + 30,
    left = coords[0] - d3.select("#d3ImplementationSection").node().getBoundingClientRect().x + 15;

  div.style("top", top + "px")
    .style("left", left + "px");
}

function hideLabel() {
  div.transition()
    .duration(200)
    .style("opacity", 0);
}
