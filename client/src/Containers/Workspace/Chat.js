// Should we store chat data in this component's state or in the
// redux store?
import React, { Component } from 'react';
import { Chat as ChatLayout } from '../../Components';
class Chat extends Component {
  state = {
    newMessage: '',
  }

  componentDidMount() {
    // event handler for enter key presses
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Enter'){
        // handle differenct contexts of Enter clicks
        if (this.state.newMessage.length > 0){
          this.submitMessage();
          //  @TODO we need to check if the chat enry is in focuse with a ref()
        }
      }
    })
    if (!this.props.replaying) {
      this.props.socket.on('RECEIVE_MESSAGE', data => {
        this.props.updatedRoom(this.props.roomId, {chat: [...this.props.messages, data]})
        // this.scrollToBottom() 
      });
    }
  }

  componentDidUpdate(prevProps, prevState){
    if ((!prevProps.referencedElement && this.props.referencedElement) && this.props.referencing) {
      console.log('starting a reference')
      this.setState({newMessage: `⬅️ ${this.state.newMessage}`})
    }
    if (prevState.newMessage.includes('⬅') && !this.state.newMessage.includes('⬅️')) {
      this.props.clearReference()
    }
  }

  changeHandler = event => {
    this.setState({
      newMessage: event.target.value
    })
  }

  submitMessage = () => {
    const { roomId, user } = this.props;
    if (this.state.newMessage.length === 0) return;
    const newMessage = {
      text: this.state.newMessage,
      user: {_id: user._id, username: user.username},
      room: roomId,
      timestamp: new Date().getTime()
    }
    if (this.state.newMessage.includes('⬅')) {
      let reference = {...this.props.referencedElement}
      // Get rid of the position, each client will calculate the position in their own browser 
      // because everyones view will be different
      delete reference.position;
      newMessage.reference = reference;
    }
    this.props.socket.emit('SEND_MESSAGE', newMessage, (res, err) => {
      if (err) {
        console.log(err);
        return;
        // IF THERES AN ERROR WE NEED TO UNDO THE SETSTATE BELOW
      }
    })
    delete newMessage.room;
    this.props.updatedRoom(roomId, {chat: [...this.props.messages, newMessage]})
    // this.scrollToBottom(); @TODO
    this.setState({
      newMessage: '',
    })
    // this.props.updateRoom({chat: updatedMessages})
  }

  render() {
    return (
      <ChatLayout 
        messages={this.props.messages} 
        change={this.changeHandler} 
        submit={this.submitMessage} 
        value={this.state.newMessage} 
        referencing={this.props.referencing}
        getChatCoords={this.props.getChatCoords}
        chatCoords={this.props.chatCoords}
        referencedElement={this.props.referencedElement}
        showReference={this.props.showReference}
      />
    )
  }
}

export default Chat;
