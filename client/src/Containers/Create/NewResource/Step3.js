import React from 'react';
import { RadioBtn, Aux } from '../../../Components/';
import classes from '../create.css';
const Step3 = props => {
  return (
    <Aux>
      <div className={classes.RadioButtons}>
        <RadioBtn
          name="public"
          checked={props.privacySetting === 'public'}
          check={() => props.check('public')}
        >
          Public
        </RadioBtn>
        <RadioBtn
          name="private"
          checked={props.privacySetting === 'private'}
          check={() => props.check('private')}
        >
          Private
        </RadioBtn>
      </div>
      <p className={classes.PrivacyDesc}>
        Anyone can join public resources, joining private resources requires
        permission from one of the resources facilitators.
        {/* If you don't want your resource to show up in the
        community list you can set your resource to super-private in settings
        after you create it. */}
      </p>
    </Aux>
  );
};

export default Step3;
