function onLoadPage() {

  // some colour variables
  var tcBlack = "#130C0E";

  // rest of vars
  var w = document.getElementById("vis").offsetWidth,
      h = document.getElementById("vis").offsetHeight,
      nodeSize = 40,
      link_width = 1,
      root,
      nodesMap = {},
      otherNodes,
      dataRoot,
      linksList,
      selectedNode,
      baseClassSelector = '.research-network '; //Modify main container class here

  //Chart nodes variables
  var pathsSVG;
  var nodesSVG;
  var force = d3.layout.force(); 

  var mainKey = 'name';

  // Utilitary functions for ids
  function generateID(text) {
    return text.replace(/(,|&|\||\s)/g,"_").toLowerCase();
  }

  function generateNodeID(node) {
    node.id = generateID(node[mainKey]);
    return node.id;
  }

  function generateLinkID(link) {
    return link.source.id + '-' + link.target.id;
  }

  // Update list of visible nodes : this is mainly done on user interaction
  function processVisibleNodes(nodesList) {
    var id;
    var rootNode;
    nodesList.forEach(function(node) {
      id = generateNodeID(node);
      if (!nodesMap[id]) {
        node.id = id;
        nodesMap[id] = node;
      }
    });

    nodesList.forEach(function(node) {
      if (node.children) {
        node.links = {};
        node.children.forEach(function(child) {
          id = generateNodeID(child);
          if (nodesMap[id]) {
            node.links[id] = child;
          }
        });
        node.children = node.children
          .map(function(node) {
            id = generateNodeID(node);
            return nodesMap[id];
          })
          .filter(function(node){ return node; });

        if (!node.expand) {
          node._children = node.children;
          node.children = null;
        }

        if (!rootNode && node.root) {
          rootNode = node;
        }
      }
    });

    if (!rootNode) {
      rootNode = nodesList[0];
    }

    return rootNode;
  }

  // Initialize d3
  // Zoom
  var zoomHighlighted = false;
  var zoom = d3.behavior.zoom()
      .scaleExtent([0.5, 1.2])
      .on("zoomstart", function() {
        zoomHighlighted = d3.select(this).classed('highlight');
      })
      .on("zoom", zoomed)
      .on("zoomend", function() {
        zoomHighlighted = false;
      });

  // D3 container
  var mainSVG = d3.select(baseClassSelector + "#vis").append("svg").attr("width", w).attr("height", h);
  var container = mainSVG.append("g");

  // Load Data
  window.dataUrl;
  if (!window.dataUrl) {
    // Modify this when JSON file is moved in Drupal
    window.dataUrl = "/sites/default/files/documents/research-network/navigation-data.txt";
  }

  d3.json(window.dataUrl, function(json) {
    dataRoot = json;


    // Build the path
    var defs = container.insert("svg:defs")
        .data(["end"]);


    defs.enter().append("svg:path")
        .attr("d", "M0,-5L10,0L0,5");
   
    pathsSVG = container.insert("svg:g").attr("class", "paths");
    nodesSVG = container.insert("svg:g").attr("class", "nodes");
    root = processVisibleNodes(dataRoot.nodes);
    
    // Set root node to center of canvas
    root.x = w / 2;
    root.y = h / 2;

    // Start network
    updateD3Network();
    selectedItem(root, true);
  });

  function findNodeByKey(nodes, key) {
    for (var i=0; i<nodes.length; ++i) {
      if (nodes[i][mainKey] === key) {
        return nodes[i];
      }
    }
    return null;
  }

  function createMap(nodes) {
    var map = {};
    nodes.forEach(function(d) {
      map[d[mainKey]] = d;
    });
    return map;
  }

  // Creates collection of links between nodes (relationships) for D3 to render
  function processLinks(nodes, nodesLinks) {
    var links = [];
    var nodesMap = createMap(nodes);
    var source, target;
    nodesLinks.forEach(function(link) {
      source = nodesMap[link.source];
      if (!source) {
        source = findNodeByKey(otherNodes, link.source);
        if (source) {
          nodes.push(source);
          nodesMap[link.source] = source;
        }
      }

      target = nodesMap[link.target];
      if (!target) {
        target = findNodeByKey(otherNodes, link.target);
        if (target) {
          nodes.push(target);
          nodesMap[link.target] = target;
        }
      }

      if (source && target) {
        links.push({
          source: source,
          target: target,
          weight: link.weight
        });
      }
    });

    return links;
  }

  var resetHighlight = function() {
    selectedItem();
    d3.select(baseClassSelector + "svg").classed("highlight", false);
    d3.selectAll(baseClassSelector + ".highlight").classed("highlight", false);
  };
   
  /**
   *  Render function
   */
  function updateD3Network() {
    var nodes = flatten(root);
    linksList = d3.layout.tree().links(nodes);

    // Initialize the force layout - simulation.
    // Change parameters to affect network layout
    force.nodes(nodes)
          .links(linksList)
          //.gravity(0.2) //Define gravity center to match research?
      .charge(-3000) //Repel force
      .chargeDistance(800) //Repel force distance
      .friction(0.5)
      .theta(0)
      .linkDistance(90) //Default Link distance
      .linkStrength(function(d) {
        //Flexibility of the link
        return 2 / d.source.children.length;
      })
      .size([w, h])
      .on("tick", tick)
      .start();

    // Get visible Links
    var path = pathsSVG.selectAll("path.link")
      .data(linksList, generateLinkID);
   
    // Renter links
    path.enter().insert("svg:path")
      .attr("id", generateLinkID)
      .attr("class", "link")
      .style("stroke-width", function(d) {
        var weight = d.source.links[d.target.id].weight;
        if (weight) {
          return (link_width + 1) * weight + "px";
        } else {
          return "2px";
        }
      })
      .style("stroke", "#eee");
   
    // Exit any old paths.
    path.exit().remove();
   
   
    // Update the nodes…
    var node = nodesSVG.selectAll("g.node")
        .data(nodes, function(d) { return d.id; });
   
   
    // Enter any new nodes.
    var nodeEnter = node.enter().append("g")
        .attr("id", function(d) { 
          return d.id;
        })
        .attr("class", function(d) { 
          var className = "node";
          if (d.children) {
            className += " expanded";
          } else if (d._children){
            className += " collapsed";
          }
          if (d.category) {
            className += " " + d.category.toLowerCase();
          }
          if (d.status) {
            className += " " + d.status.toLowerCase();
          }
          return className;
        })
        .on("click", click)
        .on("mousedown", function() {
          //Prevent mousedown zoom event
          d3.event.stopPropagation();
        })
        .call(force.drag);

    function getNodeSize(d) {
      if (d.size && parseFloat(d.size)) {
        return d.size * nodeSize; 
      } else {
        return nodeSize; 
      }
    }

    function getNodeRadius(d) {
      return getNodeSize(d)/2; 
    }

    function getNodeImageOffset(d) {
      return - getNodeSize(d)/2; 
    }

    // Create image pattern for node background
    nodeEnter.append("svg:pattern")
      .attr("id", function(d) { return "image_" + d.img;})
      .attr("width", getNodeSize)
      .attr("height", getNodeSize)
      .attr("patternUnits", "userSpaceOnUse")
      .attr("x", getNodeImageOffset)
      .attr("y", getNodeImageOffset)
      .append("svg:image")
      .attr("xlink:href",  function(d) { return d.img;})
      .attr("width", getNodeSize)
      .attr("height", getNodeSize);

    // Append background circle
    nodeEnter.append("svg:circle")
        .attr("class", "node-bkg")
        .attr("r", getNodeRadius)
        .attr("height", getNodeSize)
        .attr("width", getNodeSize)
        .style("fill", "#fff");

    // Append image circle
    var circles = nodeEnter.append("svg:circle")
        .attr("class", "node-img")
        .attr("r", getNodeRadius)
        .attr("height", getNodeSize)
        .attr("width", getNodeSize)
        .style("fill",  function(d) { 
          if (d.img) {
            return "url(#" + "image_" + d.img + ")";
          } else {
            return "laksdfjl";
          }
        });

    // On node hover handler
    var onNodeHover = function(d) {
      d3.select(baseClassSelector + "svg").classed("highlight", true);
      d3.select(baseClassSelector + "#" + d.id).classed("highlight", true);
      linksList.forEach(function(link) {
        var nodeID;
        var linkID
        if (link.source == d) {
          if (link.target) {
            nodeID = link.target.id;
          }
        } else if (link.target == d) {
          nodeID = link.source.id;
        }
        if (nodeID) {
          d3.select(baseClassSelector + "#" + nodeID).classed("highlight", true);
          d3.select(baseClassSelector + "#" + generateLinkID(link)).classed("highlight", true);
        }
      });

      selectedItem(d);
    };

    // make the image grow a little on mouse over and add the text details on click
    var setEvents = circles
      .on( 'mouseenter', onNodeHover)
      // set back
      .on( 'mouseleave', resetHighlight);

    // Append node name on roll over next to the node as well
    nodeEnter.append("text")
      .attr("class", "node-text")
      .attr("x", 0)
      .attr("y", function (d) { return getNodeRadius(d) + 20})
      .attr("width", 200)
      .style("text-anchor", "middle")
      .attr("fill", "black")
      .attr("stroke", "white")
      .attr("stroke-width", "0.1px")
      .text(function(d) {
        if (d.shortName) {
          return d.shortName;
        } else {
          return d.name;
        }
      }).each(function() {
        var self = d3.select(this),
            textLength = self.node().getComputedTextLength(),
            text = self.text(),
            textWidth = 150,
            textPadding = 0;

        while (textLength > (textWidth - 2 * textPadding) && text.length > 0) {
            text = text.slice(0, -1);
            self.text(text + '...');
            textLength = self.node().getComputedTextLength();
        }
      });
   
    // Exit any old nodes.
    node.exit().remove();

    // Re-select for update.
    path = pathsSVG.selectAll("path.link");
    node = nodesSVG.selectAll("g.node");

    // D3 network animation
    function tick() {
      node.attr("transform", function(d) { return "translate(" + d.x + "," + d.y + ")"; });
      path.attr("d", function(d) {
         var dx = d.target.x - d.source.x,
             dy = d.target.y - d.source.y,
             dr = Math.sqrt(dx * dx + dy * dy);
         return "M" + d.source.x + "," 
                + d.source.y 
                //+ "A" + dr + "," 
                //+ dr + " 0 0,1 " 
                + "L"
                + d.target.x + "," 
                + d.target.y;
      });

      node.attr("cx", function(d) { return d.x; })
          .attr("cy", function(d) { return d.y; });
    }
  }

  /**
   * Toggle children on click.
   */ 
  function click(d) {
    if (d3.event.defaultPrevented) return; // ignore drag
    if (d.children) {
      // Collapse node
      d._children = d.children;
      d.children = null;
      d3.select(this).classed("collapsed", true);
      d3.select(this).classed("expanded", false);
    } else if (d._children) {
      // Expand node
      d.children = d._children;
      d._children = null;
      d3.select(this).classed("collapsed", false);
      d3.select(this).classed("expanded", true);
    } else {
      // No children
      d3.select(this).classed("collapsed", false);
      d3.select(this).classed("expanded", false);
    }

    // Select active node
    selectedItem(d, true);
  
    // Update network
    if (d.children || d._children) {
      resetHighlight();
      updateD3Network();
    }
  }


  // Side bar details
  function showLink(value, classId) {
    if (value) {
      document.querySelector(classId).href = value;
    } else {
      document.querySelector(classId).href = '';
    }
  }

  function showItemText(value, classId) {
    d3.select(classId).classed('hidden', !value);
    if (value) {
      document.querySelector(classId).innerHTML = value;
    }
  }

  function showSectionText(value, classId) {
    d3.select(classId).classed('hidden', !value);
    if (value) {
      document.querySelector(classId + ' p').innerHTML = value;
    }
  }

  function emptyDOMElement(node) {
    while (node.firstChild) {
        node.removeChild(node.firstChild);
    }
  }

  function createChild(child) {
    var li = document.createElement('li');
    var item;

    if (child.link) {
      item = document.createElement('a');
      item.href = child.link;
    } else {
      item = document.createElement('div');
    }

    item.innerHTML = child.name;
    li.appendChild(item);
    return li;
  }

  function appendChildren(children) {
    var categoriesNode;
    var childrenNode = document.querySelector(baseClassSelector + 'nav .children');
    emptyDOMElement(childrenNode);

    children.forEach(function(child) {
      var category = child.category;
      if (!category) {
        category = 'Others'
      }
      var categoryClass = 'category-' + generateID(category);
      categoriesNode = childrenNode.querySelector('.' + categoryClass);
      if (!categoriesNode) {
        categoriesNode = document.querySelector('.placeholders .category').cloneNode(true);
        categoriesNode.className = categoryClass;
        categoriesNode.querySelector('.name').innerHTML = category;
        childrenNode.appendChild(categoriesNode);
      }

      categoriesNode.querySelector('ul').appendChild(createChild(child));

      categoriesNode = null;
    });

    childrenNode = null;
  }

  // Truncate string to max length
  function substringFromCloserCharacter(str, character, maxLength) {
    var separatorDistance = 15;
    var ndxAfter = str.indexOf(character, maxLength);
    var ndxBefore = str.lastIndexOf(character, maxLength);
    if (ndxBefore >= 0 && (maxLength - ndxBefore) < separatorDistance) {
      return str.substr(0, ndxBefore);
    } else if (ndxAfter >= 0 && (ndxAfter - maxLength) < separatorDistance) {
      return str.substr(0, ndxAfter);
    }

    return null;
  }

  function getSynopsis(description) {
    var synopsis = '';
    var suffix = '';
    var maxLength = 150;
    if (description && description.length > (maxLength + 15)) {
      // FInd full paragraph
      synopsis = substringFromCloserCharacter(description, '.', maxLength);
      suffix = '.';

      if (!synopsis) {
        // If not find nearest comma
        synopsis = substringFromCloserCharacter(description, ',', maxLength);
        suffix = ', ...';
      }

      if (!synopsis) {
        // If not find nearest space
        synopsis = substringFromCloserCharacter(description, ' ', maxLength);
        suffix = ' ...';
      }

      if (!synopsis) {
        // If not, truncate
        synopsis = description.substr(0, maxLength);
        suffix = ' ...';
      }
    }

    if (synopsis) {
      synopsis += suffix;
    }

    return synopsis;
  }

  // Display selected item
  function showNavigationItem(node) {
    showLink(node.link, baseClassSelector + 'nav a');
    if (node.title) {
      showItemText(node.title, baseClassSelector + 'nav .title');
    } else {
      showItemText(node.name, baseClassSelector + 'nav .title');
    }
    //showItemText(node.category, baseClassSelector + 'nav .category');

    var synopsis = getSynopsis(node.description);
    console.log(synopsis);

    if (synopsis) {
      showItemText(synopsis, baseClassSelector + 'nav .description p');
      showLink(node.link, baseClassSelector + 'nav .description a');
      d3.select(baseClassSelector + 'nav .description').classed('see-more', true);
    } else {
      showItemText(node.description, baseClassSelector + 'nav .description p');
      d3.select(baseClassSelector + 'nav .description').classed('see-more', false);
    }

    showSectionText(node.accomplished, baseClassSelector + 'nav .accomplished');
    showSectionText(node.nextSteps, baseClassSelector + 'nav .nextSteps');
    showSectionText(node.needsToChange, baseClassSelector + 'nav .needsToChange');

    if (node.children) {
      appendChildren(node.children);
    } else if (node._children) {
      appendChildren(node._children);
    } else {
      emptyDOMElement(document.querySelector(baseClassSelector + 'nav .children'));
    }
  }

  // Set selected item
  // Fixed item remain selected and visible in the side bar
  function selectedItem(node, fixed) {

    if (!fixed) {
      d3.select(baseClassSelector + '.node.hover').classed('hover', false);

      if (node) {
        d3.select(baseClassSelector + "#" + node.id).classed('hover', true);
        d3.select(baseClassSelector + "#" + node.id).moveToFront();
      }
    }
    if (!node) {
      node = selectedNode;
    }

    showNavigationItem(node);

    if (fixed) {
      if (selectedNode) {
        d3.select(baseClassSelector + '#' + selectedNode.id).classed('selected', false);
      }
      selectedNode = node;
      d3.select(baseClassSelector + '#' + selectedNode.id).classed('selected', true);
    }
  }

  /**
   * Returns a list of all nodes under the root.
   * D3 process this flatten list
   */ 
  function flatten(root) {
    var nodes = [];

    function positionChildren(node) {
      var offset = Math.random() * Math.PI;
      offset = 0;
      if (node && node.children) {
        node.children.forEach(function(child, ndx) {
          if (child) {
            if (!child.x) {
              var rotation = offset + (2 * Math.PI * ndx / node.children.length);
              child.x = node.x;
              child.y = node.y;

              var radius = 20;
              child.x += radius * Math.sin(rotation);
              child.y += radius * Math.cos(rotation);
            }

            positionChildren(child);
            nodes.push(child);
          }
        });
      }
    }
   
    positionChildren(root);
    nodes.push(root);
    return nodes;
  }

  // Extend d3 selection adding move to front and back 
  d3.selection.prototype.moveToFront = function() {  
    return this.each(function(){
      this.parentNode.appendChild(this);
    });
  };
  d3.selection.prototype.moveToBack = function() {  
      return this.each(function() { 
          var firstChild = this.parentNode.firstChild; 
          if (firstChild) { 
              this.parentNode.insertBefore(this, firstChild); 
          } 
      });
  };

  mainSVG.call(zoom);

  function zoomed(d) {
    container.attr("transform", "translate(" + d3.event.translate + ")scale(" + d3.event.scale + ")");
  }

  window.onresize = function() {
    w = document.getElementById("vis").offsetWidth;
    h = document.getElementById("vis").offsetHeight;
    updateD3Network();
  }
}

window.onload = onLoadPage;