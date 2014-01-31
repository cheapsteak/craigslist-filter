var rowSelector = '.content .row';
leafletPip.bassackwards = true; //flips back to leaflet's default [lat, lng] convention
paper.install(window);
new Project();

function polygonToPointsArray (map, polygon) {
    return polygon
        .getLatLngs().map(function (latlng) {
            var point = map.latLngToLayerPoint(latlng);
            return [point.x, point.y];
        });
}

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

var filterOnRegion = function (polygon) {
    $('.cf-filtered-region--pass').add('.cf-filtered-region--fail')
        .removeClass('cf-filtered-region--pass cf-filtered-region--fail'); //clear previously filtered //reflows
    if (polygon.getLatLngs().length === 0) {
        return;
    }
    $('[data-latitude]').each(function () {
        var lat = $(this).data('latitude');
        var lng = $(this).data('longitude');
        //note: polygon can be multiploygons
        if ( leafletPip.pointInLayer([lat, lng], L.geoJson(polygon.toGeoJSON()) ).length !== 0) {
            $(this).addClass('cf-filtered-region--pass'); //reflows
        } else {
            $(this).addClass('cf-filtered-region--fail'); //reflows
        }
    });
};


function setupMap() {
    var map = L.map('cf-map');
    L.tileLayer('http://{s}.tile.osm.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    return map;
}

function centerMap(map) {
    var craigslistMapHref;
    if (location.href.indexOf('.html') !== -1) {
        //e.g. http://toronto.en.craigslist.ca/apa/index100.html
        //e.g. http://toronto.en.craigslist.ca/tor/apa/index100.html
        console.log('branch 1');
        craigslistMapHref = location.origin + '/search' + location.pathname.replace(/\/index\d+\.html/i,'') + '?useMap=1'
    }
    else {
        console.log('branch 3');
        //e.g. http://toronto.en.craigslist.ca/search/apa?zoomToPosting=&catAbb=apa&query=&minAsk=&maxAsk=700&bedrooms=&housing_type=&excats=
        craigslistMapHref = location.href + '&useMap=1';
    }
    /*
        Another way to go about this:
        areaId https://sites.google.com/site/clsiteinfo/area-id-sort
        query for location or precompile a table with lat lng for each areaId
    */
    return $.get(craigslistMapHref).done(function (html) {
        var $html = $(html);
        var $dataHolder = $html.find('#mapcontainer').parent();
        var lat = $dataHolder.data('arealat');
        var lng = $dataHolder.data('arealon');
        map.setView([lat, lng], 13);
    });
}

var saveFilteringRegion = function(region) {
    chrome.storage.sync.set({"regionLatLngs": region.getLatLngs().map(function (o) {
        return [o.lat, o.lng];
    })});
};

function setupDrawing (map, region) {
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

    var mainPolygon = region; //should rename all 'mainPolygon' to ~~~'filteringRegion'~~~ something better than `filteringRegion'
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
                    return [segment.point.x, segment.point.y];
                });
                var unionedLatLngs = unionedPointsArray.map(function (pointArray) {
                    return map.layerPointToLatLng(L.point(pointArray[0], pointArray[1]));
                });

                latlngs = unionedLatLngs;
            } else {
                // ???
                // create separate layer?
                return;
            }
        } else {
            latlngs = newPolygon.getLatLngs();
            // mainPolygon.addTo(map); //in case previously deleted
            mainPolygon.initialize(map);
        }
        mainPolygon.setLatLngs(latlngs);
        filterOnRegion(mainPolygon);//need to structure this better
        saveFilteringRegion(mainPolygon);
     });
    map.on('draw:edited', function (e) {
        filterOnRegion(mainPolygon);
        saveFilteringRegion(mainPolygon);
    });
    map.on('draw:deleted', function (e) {
        mainPolygon.setLatLngs([]);
        filterOnRegion(mainPolygon);
        saveFilteringRegion(mainPolygon);
    });
}

function inject (blacklist, filterRegion, mapVisible) {
    var unfilter = function () {
        $('.cf-filtered-row')
            .removeClass('cf-filtered-row') //modifying DOM
            .unhighlight({ element: 'em', className: 'cf-matched' }); //modifying DOM
    };
    var formHTML = '<span class="cf-form searchgroup"><label><span>blacklist words (comma separated): </span><input id="cf-blacklist" type="text" placeholder="e.g.: basement, bsmt" value="' + blacklist.join(', ') + '"/></label><span>';
    $('#searchtable').append(formHTML);
    
    // this can be broken out
    var mapToggleHTML = '<span class="cf-form searchgroup"><label><span>display region filter? </span><input id="cf-display-map" type="checkbox" ' + (mapVisible && 'checked') + '/></label><span>';
    $('#searchtable').append(mapToggleHTML);



    var mapHTML = '<div id="cf-map" class="cf-map ' + (mapVisible ? '' : 'cf-hidden') + '"></div>';
    // var mapHTML = '<div id="cf-map" class="cf-map"></div>';
    $('#searchtable').append(mapHTML);

    var map = setupMap();
    centerMap(map);
    setupDrawing(map, filterRegion);
    if (filterRegion.getLatLngs().length !== 0) {
        filterOnRegion(filterRegion);
    }

    $('#cf-display-map').change(function () {
        var mapVisible = $(this).prop('checked');
        if (mapVisible) {
            $('#cf-map').removeClass('cf-hidden');
            map.invalidateSize();
        } else {
            $('#cf-map').addClass('cf-hidden');
        }
        chrome.storage.sync.set({"mapVisible": mapVisible});
    });
    // ---end map specific

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
        chrome.storage.sync.get(['blacklist', 'regionLatLngs', 'mapVisible'], function (data) {
            var region = L.polygon(data['regionLatLngs'] || []);
            inject(data['blacklist'], region, data['mapVisible']); // should separate blacklist and region filters
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