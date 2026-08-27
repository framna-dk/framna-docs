"use client";

import {
  Box,
  ListItem,
  ListItemText,
  ListItemButton,
  Skeleton as MuiSkeleton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import MenuItemHover from "@/common/ui/MenuItemHover";
import { ProjectSummary } from "@/features/projects/domain";
import { useProjectSelection } from "@/features/projects/data";
import ProjectAvatar, {
  Squircle as ProjectAvatarSquircle,
} from "./ProjectAvatar";
import { useCloseSidebarOnSelection } from "@/features/sidebar/data";

const AVATAR_SIZE = { width: 40, height: 40 };

const ProjectListItem = ({ project }: { project: ProjectSummary }) => {
  const { selectedOwner, selectedName, selectProject } = useProjectSelection();
  const selected = project.owner === selectedOwner && project.name === selectedName;
  const { closeSidebarIfNeeded } = useCloseSidebarOnSelection();

  return (
    <Template
      selected={selected}
      onSelect={() => {
        closeSidebarIfNeeded();
        selectProject(project);
      }}
      avatar={
        <ProjectAvatar
          project={project}
          width={AVATAR_SIZE.width}
          height={AVATAR_SIZE.height}
        />
      }
      title={project.displayName}
      tooltip={
        project.configError
          ? `Invalid project configuration: ${project.configError}`
          : undefined
      }
    >
      {project.configError && (
        <Typography component="span" aria-hidden sx={{ color: "warning.main", display: "flex" }}>
          <FontAwesomeIcon icon={faTriangleExclamation} size="sm" />
        </Typography>
      )}
    </Template>
  );
};

export default ProjectListItem;

export const Skeleton = () => {
  return (
    <Template
      disabled
      avatar={
        <ProjectAvatarSquircle
          width={AVATAR_SIZE.width}
          height={AVATAR_SIZE.height}
        >
          <MuiSkeleton
            variant="rectangular"
            animation="wave"
            sx={{ width: "100%", height: "100%" }}
          />
        </ProjectAvatarSquircle>
      }
    >
      <MuiSkeleton variant="text" animation="wave" width={100} />
    </Template>
  );
};

export const Template = ({
  disabled,
  selected,
  onSelect,
  avatar,
  title,
  tooltip,
  children,
}: {
  disabled?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  avatar: React.ReactNode;
  title?: string;
  tooltip?: string;
  children?: React.ReactNode;
}) => {
  return (
    <ListItem disablePadding>
      <Button disabled={disabled} selected={selected} onSelect={onSelect} tooltip={tooltip}>
        <MenuItemHover disabled={disabled}>
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <Box sx={{ width: 40, height: 40 }}>{avatar}</Box>
            {title && (
              <ListItemText
                primary={
                  <Typography
                    variant="body2"
                    style={{
                      fontWeight: selected ? 700 : 500,
                      letterSpacing: 0.1,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {title}
                  </Typography>
                }
              />
            )}
            {children}
          </Stack>
        </MenuItemHover>
      </Button>
    </ListItem>
  );
};

const Button = ({
  disabled,
  selected,
  onSelect,
  tooltip,
  children,
}: {
  disabled?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  tooltip?: string;
  children?: React.ReactNode;
}) => {
  if (disabled) {
    return <>{children}</>;
  }
  const button = (
    <ListItemButton
      onClick={onSelect}
      selected={selected}
      disableGutters
      sx={{ padding: 0 }}
    >
      {children}
    </ListItemButton>
  );
  if (!tooltip) {
    return button;
  }
  return (
    <Tooltip title={tooltip} describeChild>
      {button}
    </Tooltip>
  );
};
