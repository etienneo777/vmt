import React, { PureComponent } from 'react';
import { Link } from 'react-router-dom';
import classes from './contentBox.css';
import Icons from './Icons/Icons';
import Aux from '../../HOC/Auxil';
import Expand from './expand.js';
import Notification from '../../Notification/Notification';

class ContentBox extends PureComponent {
  state = {
    expanded: false,
  };

  toggleExpand = event => {
    event.preventDefault();
    let prevState = this.state.expanded;
    this.setState({
      expanded: !prevState,
    });
  };

  render() {
    console.log(this.props);
    const notifications =
      this.props.notifications > 0 ? (
        <Notification
          count={this.props.notifications}
          dataTestId={'content-box-ntf'}
        />
      ) : null;
    return (
      <Aux>
        <Link
          to={this.props.link}
          className={classes.Container}
          style={{ height: this.state.expanded ? 150 : 50 }}
        >
          <div
            data-testid={`content-box-${this.props.title}`}
            className={classes.SubContainer}
          >
            <div className={classes.TopBanner}>
              <div className={classes.BannerLeft}>
                <div className={classes.Icons}>
                  <Icons
                    image={this.props.image}
                    lock={this.props.locked}
                    roomType={this.props.roomType}
                    listType={this.props.listType} // private means the list is displayed in myVMT public means its displayed on /community
                  />
                </div>
                <div className={classes.Title} data-testid="">
                  {this.props.title}
                </div>
                {notifications}
              </div>
              <div
                className={classes.Expand}
                style={{
                  transform: this.state.expanded
                    ? `rotate(180deg)`
                    : `rotate(0)`,
                }}
              >
                <Expand clickHandler={this.toggleExpand} />
              </div>
            </div>
            <div className={classes.Content}>
              {this.props.details && this.state.expanded ? (
                <div className={classes.Expanded}>
                  <div>{this.props.details.description || ''}</div>
                  {this.props.details.facilitators &&
                  this.props.details.facilitators.length > 0 ? (
                    <div>
                      Facilitators:{' '}
                      {this.props.details.facilitators.map(
                        facilitator => facilitator
                      )}
                    </div>
                  ) : null}
                  {this.props.details.creator
                    ? `Creator: ${this.props.details.creator}`
                    : null}
                  {this.props.details.entryCode ? (
                    <div>Entry Code: {this.props.details.entryCode}</div>
                  ) : (
                    this.props.resource
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </Link>
      </Aux>
    );
  }
}

export default ContentBox;
