import React, { Component } from "react";
import classes from "./graph.css";
import { Aux, Modal } from "../../Components";
import Script from "react-load-script";
import socket from "../../utils/sockets";

import { initPerspectiveListener } from "./ggbUtils";
class GgbGraph extends Component {
  state = {
    loading: true,
    selectedElement: "",
    showControlWarning: false,
    receivingData: false,
    warningPosition: { x: 0, y: 0 }
  };

  graph = React.createRef();
  eventQueue = [];
  firstLabel;
  pointCounter = 1;
  noOfPoints;
  updatingOn = true;
  resetting = false; // used to reset the construction when something is done by a user not in control.
  editorState = null; // In the algebra input window,
  receivingData = false;
  batchUpdating = false;

  /**
   * @method componentDidMount
   * @description add socket listeners, window resize listner
   */

  componentDidMount() {
    // window.addEventListener('click', this.clickListener)
    window.addEventListener("resize", this.updateDimensions);
    socket.removeAllListeners("RECEIVE_EVENT");
    socket.on("RECEIVE_EVENT", data => {
      console.log(data);
      this.setState({ receivingData: true }, () => {
        // console.log("receiving event");
        // console.log(data);
        let updatedTabs = this.props.room.tabs.map(tab => {
          if (tab._id === data.tab) {
            tab.currentState = data.currentState;
          }
          return tab;
        });
        // update the redux store
        this.props.updatedRoom(this.props.room._id, { tabs: updatedTabs });
        // If this happend on the current tab
        if (this.props.room.tabs[this.props.currentTab]._id === data.tab) {
          // @TODO consider abstracting out...resued in the GgbReplayer
          // console.log("");
          switch (data.eventType) {
            case "ADD":
              if (data.definition) {
                this.ggbApplet.evalCommand(`${data.label}:${data.definition}`);
              }
              this.ggbApplet.evalXML(data.event);
              this.ggbApplet.evalCommand("UpdateConstruction()");
              break;
            case "REMOVE":
              this.ggbApplet.deleteObject(data.label);
              break;
            case "UPDATE":
              this.ggbApplet.evalXML(data.event);
              this.ggbApplet.evalCommand("UpdateConstruction()");
              break;
            case "CHANGE_PERSPECTIVE":
              this.ggbApplet.setPerspective(data.event);
              this.ggbApplet.showAlgebraInput(true);
              // this.ggbApplet.evalXML(data.event);
              // this.ggbApplet.evalCommand("UpdateConstruction()");
              break;
            case "BATCH_UPDATE":
              console.log("batch updating");
              this.batchUpdating = true;
              this.recursiveUpdate(data.event, data.noOfPoints);
              break;
            case "BATCH_ADD":
              if (data.definition) {
                // console.log(data);
                // console.log(typeof data.event);
                this.recursiveUpdate(data.event, 1, true);
              }
              break;
            default:
              break;
          }
        }
        // show a notificaiton if its on a different tab
        else {
          this.props.addNtfToTabs(data.tab);
        }
      });
    });
  }

  /**
   * @method componentDidUpdate
   * @description - determines what should happen when props update
   * and initializes socket event listeners
   * @param  {Object} prevProps - previous props before update
   */

  async componentDidUpdate(prevProps) {
    // console.log("component updated");
    if (!this.ggbApplet) return;

    // Control
    let { room, role } = this.props;
    let wasInControl = prevProps.room.controlledBy === this.props.user._id;
    let isInControl = this.props.room.controlledBy === this.props.user._id;
    let isSomeoneElseInControl = this.props.room.controlledBy && !isInControl;

    if (!wasInControl && isInControl) {
      this.ggbApplet.setMode(0);
    } else if (wasInControl && !isInControl) {
      this.ggbApplet.setMode(40);
    }

    // Referencing
    if (!prevProps.referencing && this.props.referencing) {
      this.ggbApplet.setMode(0); // Set tool to pointer so the user can select elements @question shpuld they have to be in control to reference
    } else if (prevProps.referencing && !this.props.referencing) {
      this.ggbApplet.setMode(40);
    }

    if (
      !prevProps.showingReference &&
      this.props.showingReference &&
      this.props.referToEl.elementType !== "chat_message"
    ) {
      // find the coordinates of the point we're referencing
      let position = await this.getRelativeCoords(this.props.referToEl.element);
      this.props.setToElAndCoords(null, position);
    } else if (
      this.props.showingReference &&
      prevProps.referToEl !== this.props.referToEl &&
      this.props.referToEl.elementType !== "chat_message"
    ) {
      let position = await this.getRelativeCoords(this.props.referToEl.element);
      this.props.setToElAndCoords(null, position);
    } else if (prevProps.currentTab !== this.props.currentTab) {
      let {
        currentState,
        startingPoint,
        ggbFile,
        perspective
      } = this.props.room.tabs[this.props.currentTab];
      // initPerspectiveListener(document, perspective, this.changePerspective);
      if (currentState) {
        this.ggbApplet.setXML(currentState);
        this.registerListeners();
      } else if (startingPoint) {
        this.ggbApplet.setXML(startingPoint);
        this.registerListeners();
      } else if (ggbFile) {
        this.ggbApplet.setBase64(ggbFile, () => {
          let updatedTabs = [...this.props.room.tabs];
          let updatedTab = { ...this.props.room.tabs[this.props.currentTab] };
          updatedTab.currentState = this.ggbApplet.getXML();
          updatedTabs[this.props.currentTab] = updatedTab;

          this.props.updatedRoom(this.props.room._id, { tabs: updatedTabs });
        });
      } else {
        // this.ggbApplet.setXML(INITIAL_GGB);
        this.registerListeners();
      }
      // if (perspective) {
      //   this.ggbApplet.setPerspective(perspective);
      // }
    }
  }

  /**
   * @method recursiveUpdate
   * @description takes an array of events and updates the construction in batches
   * used to make drag updates and multipoint shape creation more efficient. See ./docs/Geogebra
   * Note that this is copy-pasted in GgbReplayer for now, consider abstracting
   * @param  {Array} events - array of ggb xml events
   * @param  {Number} noOfPoints - the batch size, i.e., number of points in the shape
   * @param  {Boolean} adding - true if BATCH_ADD false if BATCH_UPDATE
   */

  recursiveUpdate(events, noOfPoints, adding) {
    if (events.length > 0) {
      if (adding) {
        for (let i = 0; i < events.length; i++) {
          this.ggbApplet.evalCommand(events[i]);
        }
      } else {
        this.ggbApplet.evalXML(
          events.splice(0, noOfPoints).join("") ||
            events.splice(0, events.length).join("")
        );
        this.ggbApplet.evalCommand("UpdateConstruction()");
        setTimeout(() => {
          this.recursiveUpdate(events, noOfPoints);
        }, 10);
      }
    } else {
      this.setState({ receivingData: false });
      return;
    }
  }

  updateDimensions = () => {
    if (this.graph.current && !this.state.loading) {
      let { clientHeight, clientWidth } = this.graph.current.parentElement;
      window.ggbApplet.setSize(clientWidth, clientHeight);
      // window.ggbApplet.evalCommand('UpdateConstruction()')
      if (
        this.props.showingReference ||
        (this.props.referencing &&
          this.props.referToEl.elmentType !== "chat_message")
      ) {
        let { element } = this.props.referToEl;
        // let position = await this.getRelativeCoords(element);
        // this.props.setToElAndCoords(null, position);

        // @TODO SET A CANCELABLE TIMER TO SHOW THE REFERENCE AFTER RESIZING IS DONE
      }
    }
  };

  /**
   * @method onScriptLoad
   * @description defines parameters for the Ggb app.
   * complete list here: https://wiki.geogebra.org/en/Reference:GeoGebra_App_Parameters
   */

  onScriptLoad = () => {
    const parameters = {
      id: "ggbApplet",
      // scaleContainerClass: "graph",
      showToolBar: true,
      showMenuBar: true,
      showAlgebraInput: true,
      language: "en",
      useBrowserForJS: false,
      borderColor: "#ddd",
      buttonShadows: true,
      preventFocus: true,
      showLogging: false,
      errorDialogsActive: false,
      appletOnLoad: this.initializeGgb,
      appName: this.props.room.tabs[0].appName || "classic"
    };

    const ggbApp = new window.GGBApplet(parameters, "6.0");
    ggbApp.inject("ggb-element");
  };

  componentWillUnmount() {
    if (this.ggbApplet && this.ggbApplet.listeners) {
      // delete window.ggbApplet;
      this.ggbApplet.unregisterAddListener(this.addListener);
      this.ggbApplet.unregisterUpdateListener();
      this.ggbApplet.unregisterRemoveListener(this.eventListener);
      this.ggbApplet.unregisterClearListener(this.clearListener);
      this.ggbApplet.unregisterClientListener(this.clientListener);
      // this.ggbApplet.unregisterStoreUndoListener(this.undoListener);
    }
    // if (!this.props.tempRoom) {
    //   let canvas = document.querySelector('[aria-label="Graphics View 1"]');
    //   this.props.updateRoom(this.props.room._id, {graphImage: {imageData: canvas.toDataURL()}})
    // }
    window.removeEventListener("resize", this.updateDimensions);
  }
  /**
   * @method initializeGgb
   * @description
   */

  initializeGgb = () => {
    this.ggbApplet = window.ggbApplet;
    this.setState({ loading: false });
    this.ggbApplet.setMode(40); // Sets the tool to zoom
    let { room, currentTab } = this.props;
    let { currentState, startingPoint, ggbFile, perspective } = room.tabs[
      currentTab
    ];
    // put the current construction on the graph, disable everything until the user takes control
    // if (perspective) this.ggbApplet.setPerspective(perspective);
    if (room.settings.participantsCanChangePerspective) {
      initPerspectiveListener(document, perspective, this.perspectiveChanged);
    }
    if (currentState) {
      this.ggbApplet.setXML(currentState);
    } else if (startingPoint) {
      this.ggbApplet.setXML(startingPoint);
    } else if (ggbFile) {
      this.ggbApplet.setBase64(ggbFile);
    }
    this.registerListeners();
  };

  /**
   * @method userCanEdit
   * @description - checks if the user is in control and connected to the socket
   *  if they are in control and connected then they can edit
   * @return {Boolean} - can the user edit?
   */
  userCanEdit = () => {
    if (this.resetting) {
      return true;
    }
    if (
      (!this.props.user.connected ||
        this.props.room.controlledBy !== this.props.user._id) &&
      !this.state.recievingData
    ) {
      return false;
    } else return true;
  };

  showAlert() {
    alert(`You are not in control. Click "Take Control" before making changes`);
  }
  /**
   * @method clientListener
   * @description client listener fires everytime anything in the geogebra construction is touched
   * we use it to listen for user interaction, and either allow that action and send it over the socket
   * if they're in control, or prevent/undo it if they're not.
   * @param  {Array} event - Ggb array [eventType (e.g. setMode),  String, String]
   */
  clientListener = event => {
    // console.log("client Listener");
    // console.log(event);
    if (this.state.receivingData) {
      return this.setState({ receivingData: false });
    }
    switch (event[0]) {
      case "setMode":
        if (event[2] === "40" || this.userCanEdit()) {
          return;
          // if the user is not connected or not in control and they initisted this event (i.e. it didn't come in over the socket)
          // Then don't send this to the other users/=.
        } else {
          if (event[2] !== "0") this.showAlert();
          this.ggbApplet.setMode(40);
        }
        break;
      case "undo":
        if (this.resetting || this.userCanEdit()) {
          this.resetting = false;
          return;
        } else {
          this.showAlert();
          this.resetting = true;
          this.ggbApplet.redo();
        }
        break;
      case "redo":
        if (this.resetting || this.userCanEdit()) {
          this.resetting = false;
          return;
        } else {
          this.showAlert();
          this.resetting = true;
          this.ggbApplet.undo();
        }
        break;
      case "select":
        break;
      case "openMenu":
        break;
      case "perspectiveChange":
        break;
      case "updateStyle":
        break;
      case "editorStart":
        // this.ggbApplet.evalCommand("editorStop()");
        // save the state of what's being edited BEFORE they edit it. This way,
        // if they're not in control and cannot edit, we can reset to this state
        this.editorState = this.ggbApplet.getEditorState();
        break;
      case "editorKeyTyped":
        if (this.userCanEdit()) {
          return;
        } else {
          // If they weren't allowed to tupe here undo to the previous state
          this.ggbApplet.setEditorState(this.editorState);
          this.showAlert();
        }
        break;
      case "movingGeos":
        this.updatingOn = false; // turn of updating so the updateListener does not send events
        break;
      case "movedGeos":
        this.updatingOn = false;

        // combine xml into one event
        let xml = "";

        for (var i = 1; i < event.length; i++) {
          xml += this.ggbApplet.getXML(event[i]);
        }

        // this.sendEvent(xml, null, null, "UPDATE", "moved");
        this.updatingOn = true;
        break;

      default:
        break;
    }
  };

  /**
   * @method addListener
   * @description listener for add events. First checks if this event was initiated
   * by the current user or by a socket event. If Initiated by a socket event we let the update happen,
   * If this was a user initiated event we first check if the user is able to make
   * this addition and calls sendEvent() if they can. Else it undoes their change.
   * @param  {String} label - label of the point, segment, shape etc added
   */

  addListener = label => {
    console.log("add ", label);
    if (this.state.receivingData) {
      this.setState({ receivingData: false });
      return;
    }
    if (this.resetting) {
      this.resetting = false;
      return;
    }
    if (!this.userCanEdit()) {
      this.resetting = true;
      this.ggbApplet.deleteObject(label);
      setTimeout(() => this.showAlert(), 0);
      return;
    }
    if (!this.state.receivingData) {
      let xml = this.ggbApplet.getXML(label);
      let definition = this.ggbApplet.getCommandString(label);
      this.sendEvent(xml, definition, label, "ADD", "added");
    }
  };

  /**
   * @method removeListener
   * @description See add (but for removing)
   */

  removeListener = label => {
    if (this.state.receivingData) {
      this.setState({ receivingData: false });
      return;
    }
    if (this.resetting) {
      this.resetting = false;
      return;
    }
    if (!this.userCanEdit()) {
      this.showAlert();
      let { room, currentTab } = this.props;
      this.ggbApplet.setXML(room.tabs[currentTab].currentState);
      // Reregister the listeners because setXML clears everything
      this.registerListeners();
      return;
    }
    if (!this.state.receivingData) {
      this.sendEvent(null, null, label, "REMOVE", "removed");
    }
  };

  /**
   * @method removeListener
   * @description See add (but for updating), we don't check if the user can edit
   * because they would have first had to change their tool (or mode) which we only
   * allow if they're already in control
   */

  updateListener = label => {
    if (this.batchUpdating) return;
    if (this.state.receivingData) {
      this.setState({ receivingData: false });
      return;
    }
    let independent = this.ggbApplet.isIndependent(label);
    let moveable = this.ggbApplet.isMoveable(label);
    let isInControl = this.props.room.controlledBy === this.props.user._id;
    if (!this.state.receivingData) {
      let xml = this.ggbApplet.getXML(label);
      this.sendEvent(xml, null, label, "UPDATE", "updated");
    }
  };

  /**
   * @param  {String} element - ggb label for what has been clicked
   * @description used to get reference positions
   */

  clickListener = async element => {
    // console.log("CLICKED", this.ggbApplet.getXML())
    if (this.props.referencing) {
      // let xmlObj = await this.parseXML(this.ggbApplet.getXML(event));
      let elementType = this.ggbApplet.getObjectType(element);
      let position;
      if (elementType !== "point") {
        let commandString = this.ggbApplet.getCommandString(element);
        element = commandString.slice(
          commandString.indexOf("(") + 1,
          commandString.indexOf("(") + 2
        );
      }
      position = await this.getRelativeCoords(element);
      this.props.setToElAndCoords({ element, elementType: "point" }, position);
    }
  };

  /**
   * @method registerListene
   *
   * \
   *  rs - register the even listeners with geogebra
   */

  registerListeners = () => {
    if (this.ggbApplet.listeners.length > 0) {
      this.ggbApplet.unregisterAddListener(this.addListener);
      this.ggbApplet.unregisterUpdateListener(this.updateListener);
      this.ggbApplet.unregisterRemoveListener(this.eventListener);
      this.ggbApplet.unregisterClearListener(this.clearListener);
      this.ggbApplet.unregisterClientListener(this.clientListener);
    }
    this.ggbApplet.registerClientListener(this.clientListener);
    this.ggbApplet.registerAddListener(this.addListener);
    this.ggbApplet.registerClickListener(this.clickListener);
    this.ggbApplet.registerUpdateListener(this.updateListener);
    this.ggbApplet.registerRemoveListener(this.removeListener);
  };

  /**
   * @method sendEvnet
   * @description emits the geogebra event over the socket and updates the room in the redux store
   * @param  {String} xml - ggb generated xml of the even
   * @param  {String} definition - ggb multipoint definition (e.g. "Polygon(D, E, F, G)")
   * @param  {String} label - ggb label. ggbApplet.evalXML(label) yields xml representation of this label
   * @param  {String} eventType - ["ADD", "REMOVE", "UPDATE", "CHANGE_PERSPECTIVE", "NEW_TAB", "BATCH"] see ./models/event
   * @param  {String} action - ggb action ["addedd", "removed", "clicked", "updated"]
   */

  sendEvent = (xml, definition, label, eventType, action) => {
    console.log(eventType, label);
    if (!this.firstLabel) {
      this.firstLabel = label;
    }
    if (this.timer) {
      if (label !== this.firstLabel && action === "updated") {
        this.pointCounter++;
      } else if (label === this.firstLabel && !this.noOfPoints) {
        this.noOfPoints = this.pointCounter;
      }
      clearTimeout(this.timer);
    }
    if (
      !this.props.user.connected ||
      this.props.room.controlledBy !== this.props.user._id
    ) {
      // @TODO HAVING TROUBLE GETTING ACTIONS TO UNDO
      alert(
        "You are not in control. The update you just made will not be saved. Please refresh the page"
      );
      this.ggbApplet.undo();
      return;
    }
    this.eventQueue.push(action === "updated" ? xml : `${label}:${definition}`);
    this.timer = setTimeout(() => {
      let newData = {
        definition,
        label,
        eventType,
        action,
        room: this.props.room._id,
        tab: this.props.room.tabs[this.props.currentTab]._id,
        event: xml,
        user: { _id: this.props.user._id, username: this.props.user.username },
        batchSize: this.noOfPoints,
        timestamp: new Date().getTime(),
        currentState: this.ggbApplet.getXML(), // @TODO could we get away with not doing this? just do it when someone leaves?
        mode: this.ggbApplet.getMode()
      };
      // throttle(() => {
      let updatedTabs = [...this.props.room.tabs];
      let updatedTab = { ...this.props.room.tabs[this.props.currentTab] };
      if (eventType === "CHANGE_PERSPECTIVE") {
        updatedTab.perspective = xml;
      }
      updatedTab.currentState = newData.currentState;
      updatedTabs[this.props.currentTab] = updatedTab;
      this.props.updatedRoom(this.props.room._id, { tabs: updatedTabs });
      if (this.eventQueue.length > 1) {
        newData.event = this.eventQueue;
        newData.eventType = action === "updated" ? "BATCH_UPDATE" : "BATCH_ADD";
        newData.noOfPoints = this.noOfPoints;
      }
      this.firstLabel = null;
      this.pointCounter = 1;
      this.noOfPoints = null;
      this.eventQueue = [];
      this.timer = null;
      socket.emit("SEND_EVENT", newData);
      // reset tracking variables
      // this.props.resetControlTimer();
    }, 110);
  };

  /**
   * @method getRelativeCoords - converts x,y coordinates of ggb point and converts them to the pizel location on the screen
   * @param  {String} element - ggb defined Label. MUST be a point
   * @return {Promise Object} - because parseXML is async
   */

  getRelativeCoords = element => {
    return new Promise(async (resolve, reject) => {
      let elX;
      let elY;
      try {
        elX = this.ggbApplet.getXcoord(element);
        elY = this.ggbApplet.getYcoord(element);
      } catch (err) {
        // get the coords of its children
      }
      // Get the element's location relative to the client Window
      let ggbCoords = this.graph.current.getBoundingClientRect();
      let construction = await this.parseXML(this.ggbApplet.getXML()); // IS THERE ANY WAY TO DO THIS WITHOUT HAVING TO ASYNC PARSE THE XML...
      let euclidianView = construction.geogebra.euclidianView[0];
      let { xZero, yZero, scale, yScale } = euclidianView.coordSystem[0].$;
      if (!yScale) yScale = scale;
      let { width, height } = euclidianView.size[0].$;
      let xOffset = ggbCoords.width - width + parseInt(xZero, 10) + elX * scale;
      let yOffset =
        ggbCoords.height - height + parseInt(yZero, 10) - elY * yScale;
      resolve({ left: xOffset, top: yOffset });
    });
  };

  render() {
    return (
      <Aux>
        <Script
          url="https://cdn.geogebra.org/apps/deployggb.js"
          onLoad={this.onScriptLoad}
        />
        <div className={classes.Graph} id="ggb-element" ref={this.graph} />
        {/* <div className={classes.ReferenceLine} style={{left: this.state.referencedElementPosition.left, top: this.state.referencedElementPosition.top}}></div> */}
        {/* {this.state.showControlWarning ? <div className={classes.ControlWarning} style={{left: this.state.warningPosition.x, top: this.state.warningPosition.y}}>
          You don't have control!
        </div> : null} */}
        <Modal show={this.state.loading} message="Loading..." />
      </Aux>
    );
  }
}

export default GgbGraph;
