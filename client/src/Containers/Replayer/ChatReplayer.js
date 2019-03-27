// Should we store chat data in this component's state or in the
// redux store?
import React, { PureComponent } from "react";
import ChatLayout from "../../Components/Chat/Chat";
class Chat extends PureComponent {
  state = {
    messages: []
  };

  componentDidMount() {
    if (this.props.log[0].text) {
      this.setState({ messages: [this.props.log[0]] });
    }
  }

  componentDidUpdate(prevProps) {
    const { log, index, reset, changingIndex, setCurrentMembers } = this.props;
    if (changingIndex) {
      let currentMembers = [];
      const messages = log.filter((entry, i) => {
        if (entry.autogenerated && i <= index) {
          if (entry.text.includes("joined")) {
            currentMembers.push({ user: entry.user });
          } else if (entry.text.includes("left")) {
            currentMembers = currentMembers.filter(member => {
              return entry.user._id !== member.user._id;
            });
          }
        }
        return i <= index && entry;
      });
      this.setState({ messages });
      reset(); // Reset sets 'skipping' to false in Containers/Replater/Replayer.js
      setCurrentMembers(currentMembers);
    } else if (prevProps.log[prevProps.index]._id !== log[index]._id) {
      this.setState(prevState => ({
        messages: [...prevState.messages, log[index]]
      }));
    }
  }

  render() {
    return <ChatLayout log={this.state.messages} replayer expanded={true} />;
  }
}

export default Chat;
