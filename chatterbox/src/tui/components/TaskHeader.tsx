import React from 'react';
import { AppHeader, AppHeaderProps } from './AppHeader.js';

export interface TaskHeaderProps extends AppHeaderProps {
  eventCount?: number;
}

export const TaskHeader: React.FC<TaskHeaderProps> = (props) => {
  return <AppHeader {...props} />;
};
