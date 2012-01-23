var rend = function(spec){
    var that = {};

    that.feeder = spec.feeder;

    that.fg = spec.fg || "#BDE7FC";
    that.bg = spec.bg || "#041BB5";

    that.winpad = spec.winpad || 10;
    that.canw = spec.canw || $(window).width() - (that.winpad * 2);
    that.canh = spec.canh || $(window).height() - (that.winpad * 2);
    that.dst_box_height = 30;
    that.port_rad = 15;
    that.cached_colors = {};
    that.highlights = {};
    that.status_msg;
    that.conn_area_y = 100;
    that.conn_line_pad = 2;
    that.src_line_left_pad = 75;
    that.conn_circ_min_rad = 3;
    that.inactive_opactity = 0.3;
    that.sweep_transition_time = 1000;
    that.infobox = infobox();
    that.max_conn_stroke = 5;
    that.inactive_color = "#999999";
    that.zoom_ratio = 0.3;
    that.zoom_levels = [];
    that.dblclick_timeout = 200;
    that.dblclick_timeout_id;

    that.s = null;

    var src_y_scale;
    var time_scale;
    var src_trust;
    var conn_circ_size_scale;
    var port_color_scale = d3.scale.category10();
    var host_color_scale = d3.scale.category20b();

    that.init = function(){
        that.s = d3.select("#viz")
        .append("svg:svg")
        .attr("class", "bgcanvas")
        .attr("width", that.canw)
        .attr("height", that.canh)
        .on("click", function(d, i){
            // clear all highlights if you click canvas
            // d3.event.detail: 1 single click, 2 dbl click
            // This avoids double clicks removing the highlights.
            if (d3.event.target.tagName == "svg"){
                if (d3.event.detail == 1){
                    that.dblclick_timeout_id = setTimeout(function(){
                      that.set_highlights(); 
                      that.redraw();
                    },
                    that.dblclick_timeout);
                }
                else{
                    clearTimeout(that.dblclick_timeout_id);
                }
            }

            if (d3.event.target.className.baseVal != "src-line-label"
               && d3.event.target.className.baseVal != "conncirc"){
                that.infobox.unset();
            }
        })

        that.intro_infobox();
        that.set_scales();
        that.paint_dsts(); 
        that.paint_ports();
        that.paint_time_hud();
        that.paint_start_sweep();
        that.paint_end_sweep();
        that.redraw();
    }

    that.redraw = function(){
        src_y_scale.domain([0, that.feeder.get_srcs().length]);
        that.feeder.update_data();
        that.paint_srcs();
        that.paint_ports();
        that.paint_time_hud();
        that.paint_conn_circs();
        that.paint_zoom_hud();
    }

    that.set_scales = function(){
        src_y_scale = d3.scale.linear()
                          .domain([0, that.feeder.get_srcs().length])
                          .range([that.conn_area_y, that.canh]);

        time_scale = d3.scale.linear()
                         .domain([that.feeder.get_sweep_start_time(), that.feeder.get_sweep_end_time()])
                         .range([that.winpad + that.src_line_left_pad, that.canw]);
        src_trust = d3.scale.quantile()
                         .domain([0, 0.001, 0.6, 1])
                         .range([
                             {color: "#666666", desc:"No accepted connections"},
                             {color: "red", desc: "Suspect: low % accepted connections"},
                             {color: "darkorange", desc: "Suspicious: significant % of rejected connections" },
                             {color: "green", desc: "Mostly accepted connections"}]);
        conn_circ_size_scale = d3.scale.linear()
                                  .domain([1, that.feeder.get_max_bundle_size()])
                                  .range([that.conn_circ_min_rad, that.get_src_line_height() * 0.8])

    }

    that.intro_infobox = function(){
        var message = "<div><strong>Welcome to Log Cluster Zoomer!</strong></div>";
        message += "<div><em>Best experienced in Chrome or Safari (for now).</div></em>"
        message += "<li>Top: servers and ports receiving data.</li>";
        message += "<li>Left: connecting IPs.</li>";
        message += "<li>Left &rarr; right: time.</li>";
        message += "<li>Double click or drag the yellow bars to zoom in.</li>"
        message += "<p><em>Click outside this message to continue</em></p>"        
        that.infobox.set(message, that.src_line_left_pad + 20, 100);
    }

    that.set_highlights = function(type, value){
        if (!type){
            for (var k in that.highlights){
                delete that.highlights[k];
            }
        }

        if (type && value){
            that.highlights[type] = value;
        }
    }

    that.get_can = function(){
        return that.s;
    }

    that.get_src_line_y = function(n){
        return src_y_scale(n);
    }

    that.get_src_line_height = function(){
        return src_y_scale(1) - src_y_scale(0);
    }

    that.get_host_box_width = function(n){
        return (that.canw) / (that.feeder.get_dsts().length);
    }
  
    that.paint_time_hud = function(){

        that.paint_time("starttime", that.feeder.get_sweep_start_time(), that.winpad + that.src_line_left_pad, "left");
        that.paint_time("endtime", that.feeder.get_sweep_end_time(), that.canw, "end");
    }

    that.paint_time = function(tname, time, xpos, anchor){
        var start_time_elem = that.get_can().selectAll("." + tname);
            start_time_elem.data([1])
            .enter()
            .append("svg:text")
            .attr("class", "hud " + tname)
            .attr("x", xpos)
            .attr("y", that.winpad * 2 + that.dst_box_height * 2)
            .attr("dy", "0.3em")
            .attr("text-anchor", anchor);

        start_time_elem.transition()
            .text(function(d){ 
                var date = new Date(); 
                date.setTime(time * 1000);
                return (that.format_date(date, 0))
            });      
    }

    that.get_minimal_date_diff = function(date1, date2){
        // date 1 should be earlier than date 2
        var date_arr_1 = [date1.getFullYear(), date1.getMonth(), date1.getDate(), date1.getHours(), date1.getMinutes(), date1.getSeconds()];
        var date_arr_2 = [date2.getFullYear(), date2.getMonth(), date2.getDate(), date2.getHours(), date2.getMinutes(), date2.getSeconds()];

        var match_pos = 0;

        for (var i = 0; i < date_arr_1.length; i++){
            if (date_arr_1[i] == date_arr_2[i]){
                match_pos = i;
            }
            else{
                break;
            }
        }
        return this.format_date(date2, match_pos + 1);
    }

    that.format_date = function(date, use_from){
        var out = "";
        var seps = ['/', '/', ' ', ':', ':', ''];
        var date_arr = [date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), padNum(date.getMinutes(), 2, 0), padNum(date.getSeconds(), 2, 0)];

        for (var i = use_from; i < date_arr.length; i++){
            out += date_arr[i] + seps[i];
        }

        return out;
    }

    that.stash_zoom_time = function(time1, time2){
        that.zoom_levels.push([that.feeder.get_sweep_start_time(),
                               that.feeder.get_sweep_end_time()]);
    }

    that.rollback_zoom_time = function(){
        if (that.zoom_levels.length > 0){
            times = that.zoom_levels.pop();

            that.feeder.set_sweep_start_time(times[0]);
            that.feeder.set_sweep_end_time(times[1]);

            that.reset_scale_and_sweeps();
        }
    }

    that.double_click_zoom = function(evt){
        var start_time = that.feeder.get_sweep_start_time();
        var end_time = that.feeder.get_sweep_end_time();
        var click_time = time_scale.invert(evt.x);
        var time_span = end_time - start_time;

        var time_window = time_span * that.zoom_ratio;

        that.stash_zoom_time();
        that.feeder.set_sweep_start_time(click_time - time_window / 2);
        that.feeder.set_sweep_end_time(click_time + time_window /2);

        that.reset_scale_and_sweeps();
        that.redraw();
    }

    that.paint_zoom_hud = function(){
        var data_hud = that.get_can().selectAll("#zoom-hud")
            .data([1]);
        var color;

        data_hud
            .enter()
            .append("svg:text")
            .attr("id", "zoom-hud")
            .attr("class", "hud zoomer")
            .attr("x", (that.canw - that.winpad) / 2)
            .attr("y", that.winpad * 2 + that.dst_box_height * 2)
            .attr("dy", "0.3em")
            .style("fill", that.inactive_color)
            .text("Zoom out")
            .style("text-anchor", "middle")
            .on("click", function(){rend.rollback_zoom_time()});
        
        if (that.zoom_levels.length > 0){
            color = "blue";
        }
        else{
            color = that.inactive_color;
        }

        data_hud
            .transition()
                .duration(that.sweep_transition_time)
                .style("fill", color);
    }

    that.paint_end_sweep = function(){
       var time = that.feeder.get_sweep_end_time();

       sweep = that.paint_sweep("end", time, that.update_end_sweep);
       
       sweep
          .attr("x1", time_scale(that.feeder.get_sweep_end_time()))
          .attr("x2", time_scale(that.feeder.get_sweep_end_time()));
    }

    that.reset_end_sweep = function(){
        var time = that.feeder.get_sweep_end_time();

        sweep = that.paint_sweep("end", time, that.update_end_sweep);
       
        sweep
          .transition()
            .duration(that.sweep_transition_time)
            .attr("x1", time_scale(that.feeder.get_sweep_end_time()))
            .attr("x2", time_scale(that.feeder.get_sweep_end_time()));       
    }

    that.update_end_sweep = function(x){
        var max_bound = d3.min([time_scale.invert(x), 
                time_scale.invert(that.canw)]);

        that.feeder.set_sweep_end_time(
            d3.max([
                max_bound,
                that.feeder.get_sweep_start_time() 
            ])
        );
        that.paint_end_sweep();
    }

    that.paint_start_sweep = function(){
       var time = that.feeder.get_sweep_start_time();

       sweep = that.paint_sweep("start", time, that.update_start_sweep);
       
       sweep
           .attr("x1", time_scale(that.feeder.get_sweep_start_time()))
           .attr("x2", time_scale(that.feeder.get_sweep_start_time()));
    }

    that.reset_start_sweep = function(){
        var time = that.feeder.get_sweep_start_time();

        sweep = that.paint_sweep("start", time, that.update_start_sweep);
       
        sweep
          .transition()
            .duration(that.sweep_transition_time)
            .attr("x1", time_scale(that.feeder.get_sweep_start_time()))
            .attr("x2", time_scale(that.feeder.get_sweep_start_time()));       
    }

    that.update_start_sweep = function(x){
        //that.feeder.set_sweep_start_time(time_scale.invert(x));
        var min_bound = d3.max([time_scale.invert(x), 
        time_scale.invert(that.winpad + that.src_line_left_pad)]);

        that.feeder.set_sweep_start_time(
            d3.min([
                min_bound,
                that.feeder.get_sweep_end_time() 
            ])
        );
        that.paint_start_sweep();
    }


    that.paint_sweep = function(sweep_type, time, sweep_updater){

       var sweep = that.get_can().selectAll("#sweep" + sweep_type);
       sweep
           .data([time_scale(time)])
           .enter()
           .append("svg:line")
           .attr("class", "sweep") 
           .attr("id", "sweep" + sweep_type)
           .style("stroke", "gold")
           .style("stroke-width", 3)
           .style("opacity", 0.8)
           .attr("y1", that.conn_area_y - 10)
           .attr("y2", that.canh)
           .attr("x1", function(d){ return d })
           .attr("x2", function(d){ return d })
           .call(d3.behavior.drag()
               .on("dragstart", function(d){
                  that.stash_zoom_time();
               })
               .on("dragend", function(d){
                   that.reset_scale_and_sweeps();
               })
               .on("drag", function(d){
                   sweep_updater(d3.event.x);
                   that.paint_time_hud();
               })
           )

           return sweep;
    }

    that.reset_scale_and_sweeps = function(){
        that.canw = $(window).width() - (that.winpad * 2);
        that.canh = $(window).height() - (that.winpad * 2);
        
        /*that.s = d3.select("#viz")
        .attr("width", that.canw)
        .attr("height", that.canh);*/

        that.feeder.update_data();
        that.set_scales();
        that.reset_start_sweep();
        that.reset_end_sweep();
        that.paint_time_hud();
        that.redraw();
    }

    that.paint_conns = function(){
        var conn_lines = that.get_can().selectAll(".connline")
            .data(that.feeder.get_conns());/*,
                  function(d) { 
                    return (d.dport + d.src + d.time + d.dst)
                  });*/

        var conn_lines_enter = conn_lines
            .enter()
                .append("svg:line")
                .attr("class", "connline")
                .style("stroke", function(d,i){
                    if (that.cached_colors.hasOwnProperty(d.dport)){
                        return that.cached_colors[d.dport];
                    }
                    else{
                        return port_color_scale(i);
                    }
                })
                .style("opacity", 0.5)
                .attr("stroke-width", function(d){ 
                  return d3.min([d.num_conns, that.max_conn_stroke]) 
                })
                .attr("stroke-dasharray", function(d){
                        if (!d.valid){
                            return [10,10];
                        }
                        else{
                            return "none";
                        }
                });

            conn_lines
              .attr("y2", function(d, i) { 
                  var attrs = that.get_port_box_attr(d.dst, d.dport);
                  return attrs.y + that.dst_box_height;
              })
              .attr("x2", function(d) {
                  var attrs = that.get_port_box_attr(d.dst, d.dport);
                  return (attrs.x + attrs.width / 2);
              });

            conn_lines

            ;

            conn_lines.transition()
                .delay(0)
                .duration(0)
                .style("opacity", function(d, i){
                    var pass = true;

                    for (var k in that.highlights){
                        if (d.hasOwnProperty(k)){
                           if (that.highlights[k] != d[k]){
                               pass = false;
                               break;
                           }
                        }
                    }

                    if (pass){
                        return 0.5;
                    }
                    else{
                        return that.inactive_opactity;
                    }
                })
                .style("stroke", function(d, i){
                        var pass = true;

                        for (var k in that.highlights){
                            if (d.hasOwnProperty(k)){
                               if (that.highlights[k] != d[k]){
                                   pass = false;
                                   break;
                               }
                            }
                        }

                        if (pass){
                            if (that.cached_colors.hasOwnProperty(d.dport)){
                                return that.cached_colors[d.dport];
                            }
                            else{
                                return port_color_scale(i);
                            }
                        }
                        else{
                            return that.inactive_color;
                        }
                   })
                .attr("y1", function(d, i) {
                   return src_y_scale(that.feeder.get_srcs().indexOfObj("src", d.src));
                })
                .attr("x1", function(d) {return time_scale(d.time) })


             conn_lines.exit().remove();

    }


    that.paint_conn_circs = function(){
        var conn_lines = that.get_can().selectAll(".conncirc")
            .data(that.feeder.get_conns(), 
                function(d) { return d.src + d.time + d.dst + d.dport });

        var conn_lines_enter = conn_lines
            .enter()
                .append("svg:circle")
                .attr("class", "conncirc")
                .on("click", function(d, i){
                    that.set_highlights("dport", d.dport);
                    that.set_highlights("src", d.src);
                    that.set_conn_infobox(d);
                    that.redraw();
                })
                .style("stroke", function(d,i){
                    if (!d.valid){
                        if (that.cached_colors.hasOwnProperty(d.dport)){
                            return that.cached_colors[d.dport];
                        }
                        else{
                            return port_color_scale(i);
                        }
                    }
                })
                .style("fill", function(d,i){
                    if (d.valid){
                        if (that.cached_colors.hasOwnProperty(d.dport)){
                            return that.cached_colors[d.dport];
                        }
                        else{
                            return port_color_scale(i);
                        }
                    }
                    else{
                        return "none";
                    }
                })
                .style("pointer-events", "visible")
                .style("opacity", 0.5)
                .attr("stroke-width", function(d){ 
                  if (!d.valid){
                    return 1;
                  } 
                })

            conn_lines
              .transition()
                .duration(that.sweep_transition_time)
                .attr("cy", function(d, i) {
                   return src_y_scale(that.feeder.get_srcs().indexOfObj("src", d.src));
                })
                .attr("cx", function(d) {
                  return time_scale(d.time);
                })
                .attr("r",  function(d) {
                  return conn_circ_size_scale(d.num_conns);
                })
                .style("opacity", function(d, i){
                    var pass = true;

                    for (var k in that.highlights){
                        if (d.hasOwnProperty(k)){
                           if (that.highlights[k] != d[k]){
                               pass = false;
                               break;
                           }
                        }
                    }

                    if (pass){
                        return 0.5;
                    }
                    else{
                        return that.inactive_opactity;
                    }
                })
                .style("stroke", function(d, i){
                    return that.set_circ_anim_color(d, i);
                })
                .style("fill", function(d, i){
                    if (d.valid){
                      return that.set_circ_anim_color(d, i);
                    }
                    else{
                      return "none";
                    }
                })

             conn_lines.exit().remove();

    }

    that.set_circ_anim_color = function(d, i){
        var pass = true;

        for (var k in that.highlights){
            if (d.hasOwnProperty(k)){
               if (that.highlights[k] != d[k]){
                  pass = false;
                  break;
               }
            }
        }

        if (pass){
            if (that.cached_colors.hasOwnProperty(d.dport)){
                return that.cached_colors[d.dport];
            }
            else{
                return port_color_scale(i);
            }
        }
        else{
            return that.inactive_color;
        }
    }

    that.set_conn_infobox = function(d){
        var start_date = new Date();
        start_date.setTime(d.time * 1000);

        var end_date = new Date();
        end_date.setTime(d.last_time * 1000);

        var valid_label = d.valid ? "accepted" : "rejected";

        var message = "<div class='infobox_header'>";
        message += "<div style='color:'>" + d.src + " &rarr; ";
        message += d.dst +":<span style='color:white;background:"+ that.cached_colors[d.dport] +"'>";
        message += d.dport + "</span></div>";
        message += "</div>";
        message += "<div>" + d.num_conns + " " + valid_label + " connections</div>";
        message += "<div>" + that.format_date(start_date, 0) + " &rarr;</div>";
        message += "<div>" + that.format_date(end_date, 0) + "</div>";
        if (d.valid && d.hasOwnProperty("user")){
          message += "<div><strong>Logged in as " + d.user + "</strong></div>";
        }
        if (d.hasOwnProperty("httpreq")){
          message += "<div>First HTTP req:<br/><strong>" + d.httpreq + "</strong></div>";
        }
        that.infobox.set(message, d3.event.x, d3.event.y);
    }

    that.get_port_box_attr = function(dst, dport){
        // need to translate back from the svg group co-ords:
        // is there a nicer way to do this?
        var elemref = d3.select(that.css_safen("#port" + dst + "_" + dport));
        var gref = d3.select(that.css_safen("#dst-group" + dst));

        return({y:(+elemref.attr("y")) + (+gref.attr("y")), 
                x:(+elemref.attr("x")) + (+gref.attr("x")),
                width:(+elemref.attr("width"))
            });
    }

    that.get_group_attr = function(elem){
        var elemref = d3.select(elem);
        if (elemref.empty()){
            console.log("Warn: " + elem + " is empty"); 
            return;
        }
        else{
            return({x: elemref.attr("x"), y: elemref.attr("y")})
        }
    }

    that.paint_srcs = function(){

        var nest = d3.nest()
            .key(function(d) { return d.src })
            .entries(that.feeder.get_srcs());

        var src_group = that.get_can().selectAll(".src-group")
            .data(that.feeder.get_srcs(), function(d) { return d.src });

        src_group.
          exit().remove();

        src_group.enter()
            .append("svg:g")
            .attr("class", "src-group")
            .attr("id", function(d){ return that.css_safen("src-group" + d.src)})
            .attr("x", that.winpad)
            .attr("y", function(d,i){ return that.get_src_line_y(i) })
            .attr("transform", function (d,i){ return "translate("+ (that.winpad) +", "+that.get_src_line_y(i)+")"});

        src_group
          .transition()
            .duration(that.sweep_transition_time)
            .attr("x", (that.winpad))
            .attr("y", function(d,i){ return that.get_src_line_y(i) })
            .attr("transform", function (d,i){ return "translate("+ (that.winpad) +", "+that.get_src_line_y(i)+")"})
            //.call(that.set_up_conns);


        var src_labels = src_group.selectAll(".src-line-label")
            .data(function(d){ return [d] });

        src_labels.enter()
            .append("text")
            .attr("class", "src-line-label")
            .attr("text-anchor", "right")
            .on("click", function(d) { 
                that.set_highlights("src", d.src);
                that.redraw();
                that.set_src_infobox(d);
            });

        src_labels.exit().remove();

        src_labels.attr("x", that.can_w)
            .attr("y", 0)
            .attr("dy", "0.8em")
            .attr("dx", "0em")
            .style("fill", function(d, i){
                //return src_trust(d.valid_conns / d.num_conns).color
                return that.set_src_label_anim_color(d, i);
            })
            .text(function(d) { return d.src })
            .transition()
              .duration(that.sweep_transition_time)
              .style("font-size", function(d){ 
                return (d3.min([(that.get_src_line_height() * 0.7), 20]))
              });

        
        var srclines_base = src_group
           .selectAll(".srclines_base")
           .data(function(d){return [d]});

        srclines_base.enter()
           .append("svg:line")
           .attr("class", "srclines_base")
           .attr("id", function(d) { return that.css_safen("srcbase" + d.src) } )
           //.style("stroke", "#CCCCCC")
           .style("stroke", function (d){return src_trust(d.valid_conns / d.num_conns).color })
           .attr("stroke-dasharray",  [5,5])
           .style("opacity", 0.3)
           .attr("x1", 0)
           .attr("y1", 0)
           .attr("x2", function(d) { 
              return time_scale(that.feeder.get_src_times()[d.src].max) + that.conn_line_pad
           })
           .attr("y2", 0);

        srclines_base
          .transition()
              .duration(that.sweep_transition_time)
              .attr("x2", function(d) { 
                 return time_scale(that.feeder.get_src_times()[d.src].max) + that.conn_line_pad
              })
 
        src_group.selectAll(".srclines_vert_base")
           .data(function(d){return [d] })
           .enter()
           .append("svg:line")
           .attr("class", "srclines_vert_base")
           .attr("id", function(d) { return that.css_safen("srcbase" + d.src) } )
           .style("stroke", "#CCCCCC")
           .attr("stroke-dasharray",  [5,5])
           .attr("x1", 0)
           .attr("y1", 0)
           .attr("x2", 0)
           .attr("y2", function(d, i){ return that.get_src_line_height() * 0.8 });

        var srclines = src_group.selectAll(".srcline")
           .data(function(d){ return [d] });

        srclines.enter()
             .append("svg:line")
             .attr("class", "srcline")
             .attr("id", function(d) { return that.css_safen("src" + d.src) } )
             .style("stroke", "black")
             .style("opacity", "0.6")
             .attr("x1", function(d){ 
                return time_scale(that.feeder.get_src_times()[d.src].min) - that.conn_line_pad - that.winpad
             })
             .attr("y1", 0)
             .attr("x2", function(d) { 
                return time_scale(that.feeder.get_src_times()[d.src].max) + that.conn_line_pad
             })
             .attr("y2", 0);
          
        srclines.
          transition()
            .duration(that.sweep_transition_time)
            .attr("x1", function(d){ 
                return time_scale(that.feeder.get_src_times()[d.src].min) - that.conn_line_pad - that.winpad
            })
            .attr("x2", function(d) { 
                return time_scale(that.feeder.get_src_times()[d.src].max) + that.conn_line_pad - that.winpad
            })
    }

    that.set_src_label_anim_color = function(d, i){
      if (that.highlights.hasOwnProperty('src')){
          if (d.src == that.highlights['src']){
             return src_trust(d.valid_conns / d.num_conns).color;
          }
          else{
            return that.inactive_color;
          }
      }
      else{
            return src_trust(d.valid_conns / d.num_conns).color;
      }
    }



    that.set_src_infobox = function(d){
        var conn_ratio = d.valid_conns / d.num_conns;
        var src_trust_level = src_trust(conn_ratio);
        var message = "<div class='infobox_header'>";
        message += "<div style='color:"+ src_trust_level.color +"'>" + d.src + "</div>";
        message += "<div class='src-trust-desc'>" + src_trust_level.desc + "</div>";
        message += "</div>"
        message += "<div class='conn_ratio_bar_valid' style='width:"+ Math.round(conn_ratio * 10000) / 100 +"%'></div><div class='conn_ratio_bar'></div>";
        message += "<div>" + d.valid_conns + " of " + d.num_conns + " (" + Math.round(conn_ratio * 10000) / 100 + "%) conns accepted</div>";
        that.infobox.set(message, d3.event.x, d3.event.y);
    }

    that.paint_dsts = function(){
        var host_width = that.get_host_box_width();
        var sets = that.feeder.get_dst_host_ports();

        var nest = d3.nest()
            .key(function(d) { return d.dst })
            .entries(sets);

        var dstsg = that.get_can().selectAll(".dst-group")
            .data(nest).enter()
            .append("svg:g")
            .attr("id", function (d) { return that.css_safen("dst-group" + d.key)})
            .attr("class", "dst-group")
            .attr("fill", function(d,i){ return port_color_scale(i)})
            .attr("x", function (d,i){ return (host_width * i) })
            .attr("y", function (d,i){ return that.winpad })
            .attr("transform", function (d,i){ return "translate("+ (that.winpad + host_width * i) +", "+that.winpad+")"});
        
        var boxes = dstsg.selectAll(".dst-box")
            .data(function(d, i){ return(d.values)})
            .enter()
            .append("svg:rect")
            .on("click", function(d) { 
                that.set_highlights("dst", d.dst);
                that.redraw();
            })
            .attr("x", function(d, i) { return 0 })
            .attr("y", 0)
            .attr("class", "dst-box")
            .attr("id", function(d) { return that.css_safen("dst" + d.dst) } )
            .style("stroke", "grey")
            .attr("fill", function(d,i){ return host_color_scale(i)})
            .attr("width", host_width)
            .attr("height", that.dst_box_height);

        dstsg.selectAll(".dst-box-label")
            .data(function(d, i){ return(d.values)})
            .enter()
            .append("text")
            .on("click", function(d){ 
                that.set_highlights("dst", d.dst);
                that.redraw();
            })
            .attr("x", host_width / 2)
            .attr("y", that.dst_box_height / 2)
            .attr("dy", "0.3em")
            //.attr("dx", "0.3em")
            .attr("fill", "lightgray")
            .attr("class", "dst-box-label")
            .attr("text-anchor", "middle")
            .attr("vertical-align", "middle")
            .text(function(d,i) { return d.dst });
    }

    that.paint_ports = function(dst, ports){
        var port_rects = d3.selectAll(".dst-group")
            .selectAll(".dst-port-box")
            .data(function(d, i){ 
                return(  
                    d.values[0].ports.map(function (e,i,o){ 
                        return { dst: d.values[0].dst, dport: e, num_dst_ports: d.values[0].ports.length }
                    })
                )
            });

        port_rects.enter().append("svg:rect")
            .attr("x", function (d, i){ 
                return (that.get_host_box_width() / d.num_dst_ports) * i  
            })
            .attr("y", that.dst_box_height )
            .attr("width", function (d, i){ return (that.get_host_box_width() / d.num_dst_ports) })
            .attr("height", that.dst_box_height)
            .attr("title", "Test")
            .attr("class", "dst-port-box")
            .attr("id", function (d) { return that.css_safen("port" + d.dst + "_" + d.dport) })
            .style("fill", function(d,i){
                if (!that.cached_colors.hasOwnProperty(d.dport)){
                   that.cached_colors[d.dport] = port_color_scale(Object.size(  that.cached_colors));
                }

                return that.set_port_label_anim_color(d, i);
            })
            .attr("stroke", "grey")
            .on("click", function(d) { 
                that.set_highlights("dport", d.dport);
                that.redraw();
            })
            .text(function(d) { return d.dport });

        port_rects
            .transition()
            .duration(that.sweep_transition_time)
                .style("fill", function(d,i){
                    if (!that.cached_colors.hasOwnProperty(d.dport)){
                       that.cached_colors[d.dport] = port_color_scale(Object.size(that.cached_colors));
                    }

                    return that.set_port_label_anim_color(d, i);
                })

        port_rects.enter()
            .append("text")
            .attr("x", function (d, i){ 
                return (that.get_host_box_width() / d.num_dst_ports) * i +  that.get_host_box_width() / d.num_dst_ports * 0.5
            })
            .attr("y", that.dst_box_height * 1.5 )
            .attr("dy", "0.3em")
            .attr("dx", "0em")
            .on("click", function(d) { 
                that.set_highlights("dport", d.dport);
                that.redraw();
            })
            .style("fill", "white")
            .attr("class", "dst-box-label")
            .attr("text-anchor", "middle")
            .text(function(d,i) { return d.dport });
    }

    that.set_port_label_anim_color = function(d, i){
        if (that.highlights.hasOwnProperty('dport')){
            if (d.dport == that.highlights['dport']){
                return that.cached_colors[d.dport];
            }
            else{
                return that.inactive_color;
            }
        }
        else{
                return that.cached_colors[d.dport];
        }
    }

    that.css_safen = function(s){
        return s.replace(/\./g, "_");
    }

    return that;
};



Array.prototype.unique = function() {
    var o = {}, i, l = this.length, r = [];
    for(i=0; i<l;i+=1) o[this[i]] = this[i];
    for(i in o) r.push(o[i]);
    return r;
};

Object.size = function(obj) {
    var size = 0, key;
    for (key in obj) {
        if (obj.hasOwnProperty(key)) size++;
    }
    return size;
};

padNum = function(pad_str, pad_lim, pad_with){
    var pad_length = pad_lim - String(pad_str).length;
    for(i = 0; i < pad_length; i++)
        pad_str = pad_with + String(pad_str);
    return pad_str;
}

Array.prototype.indexOfObj = function(prop, match){
    for (var i = 0; i < this.length; i++){
        if (this[i][prop] === match){
            return i;
        }
    }
    return -1;
}
