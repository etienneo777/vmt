import React, { Component } from 'react';
import WorkspaceLayout from '../../Layout/Room/Workspace/Workspace';
import { connect } from 'react-redux';
import * as actions from '../../store/actions/';
import DesmosReplayer from './DesmosReplayer';
import GgbReplayer from './GgbReplayer';
import ChatReplayer from './ChatReplayer';
import ReplayControls from '../../Components/Replayer/ReplayerControls';

const maxWait = 10000 // 10 seconds
// import GgbReplayer from './GgbReplayer';
// import ChatReplayer from './ChatReplayer;'
class Replayer extends Component {

  state = {
    playing: false,
    logIndex: 0,
  }

  log = this.props.room.events.concat(this.props.room.chat).sort((a, b) => a.timeStamp - b.timeStamp)

  displayDuration = this.log.reduce((acc, cur, idx, src) => {
    console.log(cur.timeStamp)
    if (src[idx + 1]){
      let diff = src[idx + 1].timeStamp - cur.timeStamp
      if (diff < maxWait) {
        console.log(src[idx + 1].timeStamp - cur.timeStamp)
        console.log('less than 10 s')
        acc += diff
      }
    }
    return acc;
  }, 0)


  componentDidUpdate(prevProps, prevState){
    if (this.state.playing && this.state.logIndex < this.log.length - 1) {
      this.playing();
    }
  }
  playing = () => {
    const currentEvent = this.log[this.state.logIndex];
    // console.log(currentEvent)
    const nextEvent = this.log[this.state.logIndex + 1];
    // console.log(nextEvent)
    const eventDuration = nextEvent.timeStamp - currentEvent.timeStamp;
    setTimeout(() => {this.setState(prevState => ({logIndex: prevState.logIndex + 1}))}, eventDuration)
  }

  pausePlay = () => {
    this.setState(prevState => ({
      playing: !prevState.playing
    }))
  }

  render() {
    console.log("display duration: ", this.displayDuration)
    console.log('rendering replayer')
    const { room } = this.props
    const event = this.log[this.state.logIndex];
    return (
      <WorkspaceLayout
        // members = {room.}
        graph = {room.roomType === 'geogebra' ?
          // I dont like that these need to be wrapped in functions 👇 could do
          // props.children but I like naming them. Wait is this dumb? we could just pass
          // event to workspaceLayout and then import the graphs there...I did kind of like
          // that a container is importing the containers....I dunno
          () => <GgbReplayer event={event} /> :
          () => <DesmosReplayer event={event} />}
        chat = {() => <ChatReplayer event={event} />}
        // chat={() => <div>chat</div>}
        replayer={() =>
          (<ReplayControls
            playing={this.state.playing}
            pausePlay={this.pausePlay}
            index={this.state.logIndex}
            startTime={this.startTime}
            event={event}
            endTime={this.endTime}
           />)
        }
      />
    )
  }
}

const mapStateToProps = (state, ownProps) => {
  return {
    room: state.rooms.byId[ownProps.match.params.room_id],
    user: state.user,
    loading: state.loading.loading,
  }
}

const mapDispatchToProps = dispatch => {
  return {
    updateRoom: (roomId, body) => dispatch(actions.updateRoom(roomId, body)),
  }
}



export default connect(mapStateToProps, mapDispatchToProps)(Replayer);
