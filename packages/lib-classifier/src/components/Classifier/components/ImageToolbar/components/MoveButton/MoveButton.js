import counterpart from 'counterpart'
import PropTypes from 'prop-types'
import React from 'react'

import moveIcon from './moveIcon'
import en from './locales/en'
import Button from '../Button'

counterpart.registerTranslations('en', en)

function MoveButton ({ active, onClick }) {
  return (
    <Button
      a11yTitle={counterpart('MoveButton.ariaLabel')}
      active={active}
      onClick={onClick}
    >
      {moveIcon}
    </Button>
  )
}

MoveButton.propTypes = {
  active: PropTypes.bool,
  onClick: PropTypes.func
}

MoveButton.defaultProps = {
  active: false,
  onClick: () => console.log(counterpart('MoveButton.ariaLabel'))
}

export default MoveButton
