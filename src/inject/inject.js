var rows = '.content .row';
var links = '.pl a';

var filter = function (blacklist) {
    var blacklistExpr = new RegExp(blacklist.join('|'), 'i');
    var pool = [];
    $(rows).each(function (i, row) {
        if (blacklistExpr.test($(row).text())) {
            pool.push(row);
        }
    });
    pool.forEach(function (row) {
        //modifying DOM here, might cause a lot of reflows
        $(row).addClass('cf-filtered-row').highlight(blacklist, { element: 'em', className: 'cf-matched' });
    });
};

function inject (blacklist) {
    var unfilter = function () {
        $('.cf-filtered-row')
            .removeClass('cf-filtered-row') //modifying DOM
            .unhighlight({ element: 'em', className: 'cf-matched' }); //modifying DOM
    };
    var formHtml = '<span class="cf-form searchgroup"><label><span>blacklist words (comma separated): </span><input id="cf-blacklist" type="text" placeholder="basement, bsmt" value="' + blacklist.join(', ') + '"/></label><span>';
    $('#searchtable').append(formHtml);
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