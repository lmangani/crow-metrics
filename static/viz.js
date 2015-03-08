
function refresh() {
  $.getJSON("metrics", function (data) {
    // "@timestamp": [ t, t, t, ... ]
    // "metric_name": [ y, y, y, ... ]

    var names = Object.keys(data).filter(function (name) { return name[0] != "@"; }).sort();

    var graphsDiv = $(".graphs");
    graphsDiv.empty();
    $.each(names, function (i, name) {
      var currentValue = data[name][data[name].length - 1].toString().substring(0, 11);
      var graphDiv = $(".graph-template").clone();
      graphDiv.removeClass("graph-template");
      graphDiv.addClass("graph");
      graphDiv.children(".peity").remove();
      graphDiv.children(".line").first().text(data[name].join(","));
      graphDiv.children(".value").first().text(currentValue);
      graphDiv.children(".name").first().text(name);
      graphsDiv.append(graphDiv);
    });

    $(".line").peity("line", { fill: "orange", stroke: "red", width: "128px", height: "24px" });
    $(".current-time").text(new Date().toString());

    setTimeout(refresh, 5000);
  });
}

setTimeout(refresh, 0);