
function onRender($) {
	// check the checkboxes whose value attribute == "true"
	$("input[type=checkbox]").each(function() {
		var value = $(this).attr("value");
		if (value === "true") {
			$(this).attr("checked", "checked");
		}
		$(this).attr("value", "true");
	});

	$("input:not([type=checkbox]), select, textarea").addClass("form-control");
}