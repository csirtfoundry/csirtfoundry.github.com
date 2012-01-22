var infobox = function(){
    var that = {};
	that.infobox = $("#infobox");
	that.margin = 20;

	that.set = function(content, x, y){
	    that.infobox.css("left", that.place_x(x));
	    that.infobox.css("top", that.place_y(y));
	    that.infobox.html(content);
	    that.infobox.show("fast");
	}

	that.unset = function(){
		that.infobox.css("display", "none");
	}

	that.place_x = function(x){
		if (x > $(window).width() / 2){
			return (x - that.infobox.width() - that.margin)
		}
		else{
			return (x + that.margin)
		}
	}

	that.place_y = function(y){
		if (y > $(window).height() / 2){
			return (y - that.infobox.height() - that.margin)
		}
		else{
			return (y + that.margin)
		}
	}

	return that;
}