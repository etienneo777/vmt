import React, { Component } from 'react';
import { connect } from 'react-redux';
import * as actions from '../../store/actions/';
import BoxList from '../../Layout/BoxList/BoxList';
import NewCourse from '../Create/NewResource/NewResource'
class Courses extends Component {

  componentDidMount() {
    console.log('Courses mounted')
    console.log('props: ', this.props)
  }
  render(){
    console.log('Courses rendereddd')
    console.log('props: ', this.props)
    return (
      <div>
        <NewCourse resource='course'/>
        <BoxList list={this.props.userCourses} resource='courses' linkPath='/profile/course/' linkSuffix='/rooms' notifications/>
      </div>
    )
  }
}

const mapStateToProps = store => ({
  // courses: getUserResources(store, 'courses'),
  userId: store.user.id,
})

const mapDispatchToProps = dispatch => ({
  // getUserCourses: userId => {dispatch(actions.getUserCourses)}
})
export default connect(mapStateToProps, mapDispatchToProps)(Courses);
