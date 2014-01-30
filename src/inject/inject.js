var rowSelector = '.content .row';

var filter = function (blacklist) {
    var blacklistExpr = new RegExp(blacklist.join('|'), 'i');
    var pool = [];

    $(rowSelector).each(function (i, row) {
        if (blacklistExpr.test($(row).text())) {
            pool.push(row);
        }
    });

    $(pool) //modifying DOM. might cause a lot of reflows
        .addClass('cf-filtered-row')
        .highlight(blacklist, { element: 'em', className: 'cf-matched' });
};

function injectMap() {
    var mapHTML = '<div id="cf-map" class="cf-map"></div>';
    $('#toc_rows .content').prepend(mapHTML);
    // var map = L.map('cf-map').setView([43.7, -79.4], 13);
    var map = L.map('cf-map');
    L.tileLayer('http://{s}.tile.osm.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    setupDrawing(map);

    var craigslistMapHref;
    if (location.pathname.split('')[1]!=='search'){
        craigslistMapHref = location.origin + '/search' + location.pathname + '?useMap=1';
    } else {
        craigslistMapHref = location.href + '&useMap=1';
    }

    /*
        Another way to go about this:
        areaId https://sites.google.com/site/clsiteinfo/area-id-sort
        query for location or precompile a table with latlng
    */

    $.get(craigslistMapHref).done(function (html) {
        var $html = $(html);
        var $dataHolder = $html.find('#mapcontainer').parent();
        var lat = $dataHolder.data('arealat');
        var lng = $dataHolder.data('arealon');
        map.setView([lat, lng], 13);
    });
}

function setupDrawing (map) {
    // Initialise the FeatureGroup to store editable layers
    var drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);

    // Initialise the draw control and pass it the FeatureGroup of editable layers
    var drawControl = new L.Control.Draw({
        draw: {
            polyline: false,
            marker: false,
            circle: false
        },
        edit: {
            featureGroup: drawnItems
        }
    });
    map.addControl(drawControl);

    var mainPolygon = L.polygon([]);
    drawnItems.addLayer(mainPolygon);

    map.on('draw:created', function (e) {
        var type = e.layerType,
            newPolygon = e.layer;
        //drawnItems.addLayer(layer);
        var latlngs = [];
        if (mainPolygon.getLatLngs().length !== 0) {
            var oldPolygonPath = new Path({
                segments: polygonToPointsArray(map, mainPolygon),
                closed: true
            });
            var newPolygonPath = new Path({
                segments: polygonToPointsArray(map, newPolygon),
                closed: true
            });
            var unionedPath = oldPolygonPath.unite(newPolygonPath);
            var isIntersecting = unionedPath.segments !== undefined;
            
            if (isIntersecting) {
                var unionedPointsArray = unionedPath.segments.map(function (segment) {
                    return [segment.point.x, segment.point.y]
                });
                var unionedLatLngs = unionedPointsArray.map(function (pointArray) {
                    return map.layerPointToLatLng(L.point(pointArray[0], pointArray[1]));
                });

                latlngs = unionedLatLngs;
            } else {
                //what do?
                //create separate layer?
                return;
            }
        } else {
            latlngs = newPolygon.getLatLngs();
        }
        mainPolygon.setLatLngs(latlngs);
     });
}

function inject (blacklist) {
    var unfilter = function () {
        $('.cf-filtered-row')
            .removeClass('cf-filtered-row') //modifying DOM
            .unhighlight({ element: 'em', className: 'cf-matched' }); //modifying DOM
    };
    var formHTML = '<span class="cf-form searchgroup"><label><span>blacklist words (comma separated): </span><input id="cf-blacklist" type="text" placeholder="e.g.: basement, bsmt" value="' + blacklist.join(', ') + '"/></label><span>';
    $('#searchtable').append(formHTML);
    
    injectMap();

    $('#cf-blacklist').on('input', _.debounce(function (e) {
        //get new value
        var blacklist = e.target.value.split(',')
            .map(Function.prototype.call, String.prototype.trim)
            .filter(function (item) {
                return item !== '';
            });
        //update storage
        chrome.storage.sync.set({"blacklist": blacklist});
        //DONT wait for cb. run filter with new value
        unfilter();
        if (blacklist.length > 0) {
            filter(blacklist);
        }
    }, 250));
    if (blacklist && blacklist.length > 0) {
        filter(blacklist);
    }
}

chrome.extension.sendMessage({}, function(response) {
	var readyStateCheckInterval = setInterval(function() {
	if (document.readyState === "complete") {
		clearInterval(readyStateCheckInterval);

        //check storage for existing blacklist
        chrome.storage.sync.get("blacklist", function (data) {
            inject(data.blacklist);
        });
	}
	}, 10);
});

function scrapeCoords () {
    return $(rowsSelector + '[data-latitude][data-longitude]').map(function (i, el) {
        var $el = $(el);
        return {
            pid: $el.data('pid'),
            lat: $el.data('latitude'),
            lng: $el.data('longitude')
        };
    });
}

function calcBounds(coords) {
    var lats = _.pluck(coords, 'lat').map(parseFloat);
    var lngs = _.pluck(coords, 'lng').map(parseFloat);
    //var avgLat = lats.reduce( function (a, b) { return a + b;} );
    //var avgLng = lats.reduce( function (a, b) { return a + b;} );
    return {
        minLat : Math.min.apply(null, lats),
        maxLat : Math.max.apply(null, lats),
        minLng : Math.min.apply(null, lngs),
        maxLng : Math.max.apply(null, lngs)
    };
}