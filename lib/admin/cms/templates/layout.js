

// this will be called once per page render that includes this template
// can use this to make global updates to the page only when this template is used


function onPageRender($) {
	//console.log(typeof JSON);
	
}


// this will be called once each time the template is rendered

function onRender($, url) {
	$("ul.navbar-nav > li").removeClass("active");
	$("ul.navbar-nav > li > a").each(function () {
		if ($(this).attr("href") === url) {
			$(this).closest("li").addClass("active");
		}
	});
	//$("body > div.container").append($("<h1>this is another test</h1>"));
}


/*
function upper(test) {
	return test.toUpperCase();
}
*/