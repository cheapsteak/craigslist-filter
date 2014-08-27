/*
format of a single listing
Ask: "3300"
Bedrooms: "3"
CategoryID: "1"
ImageThumb: "http://images.craigslist.org/01616_oXcia3hxjG_50x50c.jpg"
Latitude: 43.746015
Longitude: -79.336377
PostedDate: "1399342246"
PostingID: "4445813178"
PostingTitle: "WELL PRICED 3 bedroom house! Toronto Luxury Rentals"
PostingURL: "/tor/apa/4445813178.html"
*/

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

var regionChanged = function (polygon, listings) { // TODO: DECOUPLE this shouldn't have to know about listings
    $('.cf-filtered-region--pass').add('.cf-filtered-region--fail')
        .removeClass('cf-filtered-region--pass cf-filtered-region--fail'); //clear previously filtered //reflows
    if (polygon.getLatLngs().length === 0) {
        return;
    }

    //NOTE: PostingID is a string in the JSON data
    $('.row[data-pid]').each(function () {
        var pid = $(this).attr('data-pid');
        // NOTE: not sure why some listings[pids] are undefined. 
        // perhaps they don't have an associated lat & lng?
        // or maybe it's a paging issue / got cut off from the JSON?

        // probably because of clusters with renewed listings like this
        // http://toronto.en.craigslist.ca/jsonsearch/apa/tor?geocluster=113030659654&key=0SNVYb1sgukhvVlkbQKtiA
        // the pid in the main JSON list (e.g. http://toronto.en.craigslist.ca/jsonsearch/tor/apa/index200.html) is not always the most recent
        // and the most recent one is the one in the webpage's markup
        if (listings[pid]) {
            var lat = listings[pid].Latitude;
            var lng = listings[pid].Longitude;
            //note: polygon can be multiploygons
            if ( leafletPip.pointInLayer([lat, lng], L.geoJson(polygon.toGeoJSON()) ).length !== 0) {
                $(this).addClass('cf-filtered-region--pass');
            } else {
                $(this).addClass('cf-filtered-region--fail');
            }
        } else {
            $(this).addClass('cf-filtered-region--wtf');
        }
    });

    hoistListings();
};

var hoistListings = function () {
    var matchedListings = $('.row.cf-filtered-region--pass').detach();
    var unsureListings = $('.row.cf-filtered-region--wtf').detach();

    var fragment = $(document.createDocumentFragment());
    fragment
        .append('<h4 class="ban cf-ban"><span class="bantext">Definitely within filtered region</span></h4>')
        .append(matchedListings)
        .append('<h4 class="ban cf-ban"><span class="bantext">Not sure if within filtered region (sorry..wish I could do better. <a href="https://github.com/cheapsteak/craigslist-filter/issues/1">suggestions welcome</a>)</span></h4>')
        .append(unsureListings)
        .append('<h4 class="ban cf-ban"><span class="bantext">Definitely outside filtered region</span></h4>')
        .prependTo('.content');
};


function setupMap() {
    L.Map.include(L.LayerIndexMixin); // for layerindex
    var map = L.map('cf-map');
    L.tileLayer('http://{s}.tile.osm.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    return map;
}

var saveFilteringRegion = function(region) {
    chrome.storage.sync.set({"regionLatLngs": region.getLatLngs().map(function (o) {
        return [o.lat, o.lng];
    })});
};

function setupDrawing (map, region, listings) { // TODO: DECOUPLE! this shouldn't have to know about listings
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

    var mainPolygon = region; //should rename all 'mainPolygon' to ~~'filteringRegion'~~ something better than `filteringRegion'
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
                // create separate layer? but then complications with possibility of intersecting layers
                return;
            }
        } else {
            latlngs = newPolygon.getLatLngs();
            // mainPolygon.addTo(map); //in case previously deleted
            mainPolygon.initialize(map);
        }
        mainPolygon.setLatLngs(latlngs);
        regionChanged(mainPolygon, listings);//need to structure this better
        saveFilteringRegion(mainPolygon);
     });
    map.on('draw:edited', function (e) {
        regionChanged(mainPolygon, listings); // TODO: DECOUPLE
        saveFilteringRegion(mainPolygon);
    });
    map.on('draw:deleted', function (e) {
        mainPolygon.setLatLngs([]);
        regionChanged(mainPolygon, listings); // TODO: DECOUPLE
        saveFilteringRegion(mainPolygon);
    });
}

function plotListings(map, listings) {
    Object.keys(listings).forEach(function(key) {
        var listing = listings[key];
        if (!listing.Latitude || !listing.Longitude) {
            return;
        }
        var measle = L.circleMarker(L.latLng([listing.Latitude, listing.Longitude]), {radius:1, color: '#c00', fillColor: '#c00'}).addTo(map);
        map.indexLayer(measle);
        // TODO: do something when user clicks on a marker
        // if (!listing.PostingTitle) {
        //     // this posting has been "renewed", and thus has multiple content data (most importantly, image and title)
        //     // e.g. http://toronto.en.craigslist.ca/jsonsearch/apa/tor?geocluster=113030658923&key=HtiSrdr6Na9wV1OEgdsUYA
        //     //{"Longitude":-79.6001097407708,"NumPosts":"2","PostedDate":"1399324984","GeoCluster":"113030734929","PostingID":"4416076632","url":"/jsonsearch/apa/tor?geocluster=113030734929&key=Ntl4lmnPBteCgRvbKuEtrw","Latitude":43.7428066415866}
        // } else {
        //     // measle.bindPopup('<a href="'+listing.PostingURL+'">' + listing.PostingTitle + '</a>');
        // }
        measle.on('click', function () {
            console.log('listing at '+ key, listing);
        });
    });
};

function inject (blacklist, filterRegion, mapVisible) {
    var unfilter = function () {
        $('.cf-filtered-row')
            .removeClass('cf-filtered-row') //modifying DOM
            .unhighlight({ element: 'em', className: 'cf-matched' }); //modifying DOM
    };
    var formHTML = '<span class="cf-form searchgroup"><label><span>blacklist words (comma separated): </span><input id="cf-blacklist" type="text" placeholder="e.g.: basement, bsmt" value="' + blacklist.join(', ') + '"/></label><span>';
    $('#searchtable').append(formHTML);
    
    // this can be broken out
    var mapToggleHTML = '<span class="cf-form searchgroup"><label><span>display region filter? </span><input id="cf-display-map" class="cf-checkbox" type="checkbox" ' + (mapVisible && 'checked') + '/></label><span>';
    $('#searchtable').append(mapToggleHTML);

    var mapHTML = '<div id="cf-map" class="cf-map ' + (mapVisible ? '' : 'cf-hidden') + '"><span class="cf-loading">loading...</span></div>';
    $('#searchtable').append(mapHTML);

    getListings().done(function (listings) {
        window.listings = listings;
        var map = setupMap();
        var centerLat = $('#mapcontainer').data('arealat') || listings._center.lat;
        var centerLng = $('#mapcontainer').data('arealon') || listings._center.lng;
        map.setView([centerLat, centerLng], 13);
        setupDrawing(map, filterRegion, listings);
        plotListings(map, listings);
        if (filterRegion.getLatLngs().length !== 0) {
            regionChanged(filterRegion, listings);
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
            var blacklist = data['blacklist'] || [];
            var mapVisible = data['mapVisible'] || false;
            inject(blacklist, region, mapVisible); // should separate blacklist and region filters
        });
	}
	}, 10);
});

function getListings () {
    var deferred = $.Deferred();

    var queryString = window.location.search;
    var pathConstituents = window.location.pathname.split('/');
    var jsonUrl;

    // if first non-empty pathConstituent is 'search'
    if (location.pathname.split('/')[1] === 'search') {
        jsonUrl = '/json' + location.pathname.substr(1) + location.search;
    } else {
        // e.g.
        // http://toronto.en.craigslist.ca/tor/apa/index100.html
        // http://toronto.en.craigslist.ca/apa/
        jsonUrl = '/jsonsearch' + location.pathname + location.search;
    }

    $.get('/jsonsearch' + location.pathname + location.search).done(function (data) {
        var listings = {};
        //hashListings(data[0]);
        var aggregateLat = 0;
        var aggregateLng = 0;

        data[0].forEach(function (item) {
            listings[item.PostingID] = item;
            aggregateLat += item.Latitude;
            aggregateLng += item.Longitude;
        });

        // this center is bogus. returns center of lake
        listings._center = {
            lat: data[1].clat,
            lng: data[1].clng
        };
        deferred.resolve(listings);
    });

    return deferred.promise()
}