/**
 * Progress Bar Component
 */
import React from 'react';

const ProgressBar = ({ percentage, color = 'blue', showLabel = false }) => {
  const clampedPercentage = Math.min(100, Math.max(0, percentage || 0));
  
  const colorClasses = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
    red: 'bg-red-500',
    purple: 'bg-purple-500',
  };

  // Auto color based on percentage
  let autoColor = 'blue';
  if (percentage >= 100) autoColor = 'red';
  else if (percentage >= 85) autoColor = 'yellow';
  else if (percentage >= 70) autoColor = 'green';

  const bgColor = color === 'auto' ? colorClasses[autoColor] : colorClasses[color];

  return (
    <div className="relative">
      <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
        <div 
          className={`h-full rounded-full transition-all duration-300 ${bgColor}`}
          style={{ width: `${clampedPercentage}%` }}
        />
      </div>
      {showLabel && (
        <span className="absolute right-0 -top-5 text-xs text-gray-500">{clampedPercentage}%</span>
      )}
    </div>
  );
};

export default ProgressBar;
