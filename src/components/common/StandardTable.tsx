import React from 'react';
import { UNIFIED_COLOR_CONFIG } from '../../types/theme';

interface StandardTableProps extends React.TableHTMLAttributes<HTMLTableElement> {
  children: React.ReactNode;
  containerClassName?: string;
}

export const StandardTable: React.FC<StandardTableProps> = ({
  children,
  className = '',
  containerClassName = '',
  ...props
}) => {
  return (
    <div
      className={`overflow-x-auto rounded-md border ${UNIFIED_COLOR_CONFIG.borderDefault} ${UNIFIED_COLOR_CONFIG.surface} ${containerClassName}`}
    >
      <table className={`w-full text-right text-xs border-collapse sap-table-compact ${className}`} {...props}>
        {children}
      </table>
    </div>
  );
};

interface StandardTableHeaderProps extends React.HTMLAttributes<HTMLTableSectionElement> {
  children: React.ReactNode;
}

export const StandardTableHeader: React.FC<StandardTableHeaderProps> = ({
  children,
  className = '',
  ...props
}) => {
  return (
    <thead
      className={`${UNIFIED_COLOR_CONFIG.tableHeaderBg} ${UNIFIED_COLOR_CONFIG.tableHeaderText} ${UNIFIED_COLOR_CONFIG.tableHeaderBorder} text-xs ${className}`}
      {...props}
    >
      {children}
    </thead>
  );
};

interface StandardTableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  children: React.ReactNode;
  striped?: boolean;
  isClickable?: boolean;
}

export const StandardTableRow: React.FC<StandardTableRowProps> = ({
  children,
  className = '',
  striped = true,
  isClickable = false,
  ...props
}) => {
  return (
    <tr
      className={`
        h-8
        ${UNIFIED_COLOR_CONFIG.tableRowBase}
        ${striped ? UNIFIED_COLOR_CONFIG.tableRowStripe : ''}
        ${UNIFIED_COLOR_CONFIG.tableRowHover}
        ${UNIFIED_COLOR_CONFIG.tableRowText}
        border-b ${UNIFIED_COLOR_CONFIG.borderSubtle}
        ${isClickable ? 'cursor-pointer active:bg-[#e5f3fa]' : ''}
        ${className}
      `}
      {...props}
    >
      {children}
    </tr>
  );
};

interface StandardTableCellProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  children: React.ReactNode;
  isMono?: boolean;
  align?: 'right' | 'center' | 'left';
}

export const StandardTableCell: React.FC<StandardTableCellProps> = ({
  children,
  className = '',
  isMono = false,
  align = 'right',
  ...props
}) => {
  const alignClass = align === 'center' ? 'text-center' : align === 'left' ? 'text-left' : 'text-right';
  return (
    <td
      className={`py-1.5 px-2.5 text-[#333333] ${alignClass} ${isMono ? 'font-mono text-[#333333] font-medium tabular-nums' : ''} ${className}`}
      {...props}
    >
      {children}
    </td>
  );
};

interface StandardTableHeadCellProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  children: React.ReactNode;
  align?: 'right' | 'center' | 'left';
}

export const StandardTableHeadCell: React.FC<StandardTableHeadCellProps> = ({
  children,
  className = '',
  align = 'right',
  ...props
}) => {
  const alignClass = align === 'center' ? 'text-center' : align === 'left' ? 'text-left' : 'text-right';
  return (
    <th
      className={`py-1.5 px-2.5 bg-white font-semibold text-[#333333] whitespace-nowrap border-b border-[#d9d9d9] ${alignClass} ${className}`}
      {...props}
    >
      {children}
    </th>
  );
};
