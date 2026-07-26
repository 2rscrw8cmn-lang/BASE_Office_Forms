/*
 * The BASE application component library. Features import shared components from
 * this barrel; they do not import Radix or Lucide directly, and they do not add
 * new global visual CSS. Importing this module also brings in the component
 * stylesheet and tokens once.
 */

import "../theme/tokens.css";
import "./base-components.css";

// Icons
export { Icon, ICON_NAMES, type IconName, type IconProps } from "./icons/Icon";

// Primitives
export {
  Button,
  ButtonLink,
  type ButtonProps,
  type ButtonLinkProps,
  type ButtonVariant,
  type ButtonSize,
} from "./primitives/Button";
export { IconButton, type IconButtonProps } from "./primitives/IconButton";
export { TextInput, type TextInputProps } from "./primitives/TextInput";
export { TextArea, type TextAreaProps } from "./primitives/TextArea";
export { Select, type SelectProps } from "./primitives/Select";
export { DateInput, type DateInputProps } from "./primitives/DateInput";
export { Checkbox, type CheckboxProps } from "./primitives/Checkbox";
export {
  RadioGroup,
  type RadioGroupProps,
  type RadioOption,
} from "./primitives/RadioGroup";
export { Field, useField, type FieldProps } from "./primitives/Field";
export { Label, type LabelProps } from "./primitives/Label";
export { HelpText, type HelpTextProps } from "./primitives/HelpText";
export {
  ValidationMessage,
  type ValidationMessageProps,
} from "./primitives/ValidationMessage";
export { Badge, type BadgeProps, type BadgeTone } from "./primitives/Badge";
export {
  Tooltip,
  TooltipProvider,
  type TooltipProps,
} from "./primitives/Tooltip";
export { Divider, type DividerProps } from "./primitives/Divider";
export { Spinner, type SpinnerProps } from "./primitives/Spinner";
export { Skeleton, type SkeletonProps } from "./primitives/Skeleton";

// Interactive
export { Dialog, DialogClose, type DialogProps } from "./interactive/Dialog";
export { AlertDialog, type AlertDialogProps } from "./interactive/AlertDialog";
export {
  DropdownMenu,
  type DropdownMenuProps,
  type DropdownMenuItem,
} from "./interactive/DropdownMenu";
export { Popover, type PopoverProps } from "./interactive/Popover";
export { Tabs, type TabsProps, type TabItem } from "./interactive/Tabs";
export {
  ToastProvider,
  useToast,
  type ToastOptions,
  type ToastTone,
} from "./interactive/Toast";
export {
  CommandMenu,
  type CommandMenuProps,
  type CommandItem,
} from "./interactive/CommandMenu";
export { Collapsible, type CollapsibleProps } from "./interactive/Collapsible";
export { Drawer, type DrawerProps } from "./interactive/Drawer";

// Application patterns
export {
  AppShell,
  type AppShellProps,
  type AppShellNavItem,
} from "./patterns/AppShell";
export { PageHeader, type PageHeaderProps } from "./patterns/PageHeader";
export {
  ProjectHeader,
  type ProjectHeaderProps,
} from "./patterns/ProjectHeader";
export {
  ProjectTabs,
  type ProjectTabsProps,
  type ProjectTab,
} from "./patterns/ProjectTabs";
export {
  RegisterPage,
  type RegisterPageProps,
  type RegisterStatus,
} from "./patterns/RegisterPage";
export {
  RegisterToolbar,
  type RegisterToolbarProps,
} from "./patterns/RegisterToolbar";
export { FilterChip, type FilterChipProps } from "./patterns/FilterChip";
export { Panel, type PanelProps } from "./patterns/Panel";
export {
  MetadataStrip,
  type MetadataStripProps,
  type MetadataItem,
} from "./patterns/MetadataStrip";
export { FileRow, type FileRowProps } from "./patterns/FileRow";
export {
  ActivityFeed,
  type ActivityFeedProps,
  type ActivityItem,
} from "./patterns/ActivityFeed";
export { EmptyState, type EmptyStateProps } from "./patterns/EmptyState";
export { ErrorState, type ErrorStateProps } from "./patterns/ErrorState";
export {
  PermissionState,
  type PermissionStateProps,
} from "./patterns/PermissionState";
export { FormDialog, type FormDialogProps } from "./patterns/FormDialog";
export {
  WorkspaceSection,
  type WorkspaceSectionProps,
} from "./patterns/WorkspaceSection";
export {
  WorkspacePage,
  WorkspaceNotice,
  type WorkspacePageProps,
  type WorkspaceNoticeProps,
  type WorkspaceStatus,
} from "./patterns/WorkspacePage";
export {
  Breadcrumbs,
  type BreadcrumbsProps,
  type Crumb,
} from "./patterns/Breadcrumbs";
export {
  ProjectStatusBadge,
  type ProjectStatusBadgeProps,
  PROJECT_STATUS_VOCABULARY,
  RfiStatusBadge,
  type RfiStatusBadgeProps,
  RFI_STATUS_VOCABULARY,
  RecordStatusBadge,
  type RecordStatusBadgeProps,
  RECORD_STATUS_VOCABULARY,
  RevisionStatusBadge,
  type RevisionStatusBadgeProps,
  REVISION_STATUS_VOCABULARY,
  AttentionBadge,
  type AttentionBadgeProps,
  type AttentionCondition,
  ATTENTION_CONDITIONS,
  ATTENTION_VOCABULARY,
  type StatusDescriptor,
} from "./patterns/StatusBadge";
export {
  SaveIndicator,
  type SaveIndicatorProps,
  type SaveState,
} from "./patterns/SaveIndicator";

// Shared UI utilities
export { useReturnFocus } from "./util/useReturnFocus";

// Tokens
export { APP_TOKENS, BRAND_TOKENS, type AppToken } from "../theme/tokens";
