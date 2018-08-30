// PROPS:
  // tabs:  [String]
  // content: jsx || String (if no content)
  // activeTab: String
  // crumbs: [{name: String, notifications: Number}]
//
import React from 'react';
import classes from './dashboard.css';
import TabList from '../../Components/Navigation/TabList/TabList';
import BreadCrumbs from '../../Components/Navigation/BreadCrumbs/BreadCrumbs';
import DnDTrash from '../../Containers/DnDTrash/DnDTrash';
import Resources from './Resources/Resources';
import Students from '../../Containers/Students/Students'
import Trash from '../../Components/UI/Trash/Trash';

const dashboard = props => {
  const { userResources, notifications, owner} = props.contentData
  console.log(notifications)
  return (
    <section className={classes.Container}>
      <div className={classes.BreadCrumbs}>
        <BreadCrumbs crumbs={props.crumbs}/>
      </div>
      <div className={classes.Main}>
        <div className={classes.SidePanel}>
          <div className={classes.Image}>Image</div>
          <div className={classes.SpTitle}></div>
        </div>
        <div className={classes.Content}>
          <div className={classes.Tabs}>
            <TabList routingInfo={props.routingInfo} tabs={props.tabs} />
          </div>
          <div className={classes.MainContent}>
            <DnDTrash>
              {props.contentData.resource === 'members' ?
                <Students classList={userResources} notifications={notifications.access} owner={owner}/>
              : <Resources {...props.contentData} /> }
              <div className={classes.Trash}><Trash /></div>
            </DnDTrash>
          </div>
        </div>
      </div>
    </section>
  )
}

export default (dashboard);
