import {
  PROJECT_STATUSES,
  type ProjectStatus,
} from "../../../domain/projects/project";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type ReactNode, type SyntheticEvent } from "react";
import {
  Button,
  Field,
  FormDialog,
  PROJECT_STATUS_VOCABULARY,
  Select,
  TextArea,
  TextInput,
} from "../../components";
import { useShell } from "../../app/ShellContext";
import { createProject, ProjectsApiError } from "./api";
import type { CreateProjectInput, ProjectListItem } from "./types";
import { projectsQueryKey } from "./useProjects";

type CreatableProjectStatus = Exclude<ProjectStatus, "archived">;

const CREATE_PROJECT_STATUSES = PROJECT_STATUSES.filter(
  (status) => status !== "archived",
) as CreatableProjectStatus[];

interface FormValues {
  projectNumber: string;
  name: string;
  status: CreatableProjectStatus;
  city: string;
  region: string;
  description: string;
}

interface FormErrors {
  projectNumber?: string;
  name?: string;
}

const INITIAL_VALUES: FormValues = {
  projectNumber: "",
  name: "",
  status: "planning",
  city: "",
  region: "",
  description: "",
};

export function CreateProjectDialog({
  onCreated,
}: {
  onCreated: (project: ProjectListItem) => void;
}) {
  const shell = useShell();
  const queryClient = useQueryClient();
  const projectNumberRef = useRef<HTMLInputElement>(null);
  const projectNameRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<FormValues>(INITIAL_VALUES);
  const [errors, setErrors] = useState<FormErrors>({});

  const mutation = useMutation({
    mutationFn: createProject,
    onSuccess: async (project) => {
      await queryClient.invalidateQueries({ queryKey: projectsQueryKey });
      shell.announce("Project created.");
      setOpen(false);
      onCreated(project);
    },
    onError: () => {
      shell.announce("The project could not be created.");
    },
  });

  const update = <Key extends keyof FormValues>(
    key: Key,
    value: FormValues[Key],
  ) => {
    setValues((current) => ({ ...current, [key]: value }));
    if (key === "projectNumber" || key === "name") {
      setErrors((current) => ({ ...current, [key]: undefined }));
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && mutation.isPending) return;
    if (nextOpen) {
      setValues(INITIAL_VALUES);
      setErrors({});
      mutation.reset();
    }
    setOpen(nextOpen);
  };

  const handleSubmit = (
    event: SyntheticEvent<HTMLFormElement, SubmitEvent>,
  ) => {
    event.preventDefault();
    if (mutation.isPending) return;

    const nextErrors: FormErrors = {};
    if (!values.projectNumber.trim()) {
      nextErrors.projectNumber = "Project number is required.";
    }
    if (!values.name.trim()) {
      nextErrors.name = "Project name is required.";
    }
    setErrors(nextErrors);
    if (nextErrors.projectNumber || nextErrors.name) {
      (nextErrors.projectNumber
        ? projectNumberRef
        : projectNameRef
      ).current?.focus();
      shell.announce("Please correct the highlighted fields.");
      return;
    }

    const city = values.city.trim();
    const region = values.region.trim();
    const description = values.description.trim();
    const input: CreateProjectInput = {
      projectNumber: values.projectNumber.trim(),
      name: values.name.trim(),
      status: values.status,
      ...(description ? { description } : {}),
      ...(city || region
        ? { address: { city: city || null, region: region || null } }
        : {}),
    };
    shell.announce("Creating project.");
    mutation.mutate(input);
  };

  let errorSummary: ReactNode;
  if (mutation.error instanceof ProjectsApiError) {
    errorSummary = (
      <>
        <p>{mutation.error.message}</p>
        {mutation.error.requestId ? (
          <p className="projects-create-request-id">
            Request ID <code>{mutation.error.requestId}</code>
          </p>
        ) : null}
      </>
    );
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={handleOpenChange}
      trigger={
        <Button variant="primary" iconStart="plus" data-create-project>
          Create project
        </Button>
      }
      title="Create project"
      description="Add a project to this organization. Details can be refined later."
      submitLabel="Create project"
      loading={mutation.isPending}
      errorSummary={errorSummary}
      initialFocusRef={projectNumberRef}
      variant="sheet"
      className="projects-create-dialog"
      onSubmit={handleSubmit}
    >
      <div className="projects-create-grid projects-create-grid--paired">
        <Field label="Project number" required error={errors.projectNumber}>
          <TextInput
            ref={projectNumberRef}
            value={values.projectNumber}
            autoComplete="off"
            onChange={(event) => {
              update("projectNumber", event.target.value);
            }}
          />
        </Field>
        <Field label="Status">
          <Select
            value={values.status}
            onChange={(event) => {
              update("status", event.target.value as CreatableProjectStatus);
            }}
          >
            {CREATE_PROJECT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {PROJECT_STATUS_VOCABULARY[status].label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Project name" required error={errors.name}>
        <TextInput
          ref={projectNameRef}
          value={values.name}
          autoComplete="off"
          onChange={(event) => {
            update("name", event.target.value);
          }}
        />
      </Field>
      <div className="projects-create-grid projects-create-grid--paired">
        <Field label="City">
          <TextInput
            value={values.city}
            autoComplete="address-level2"
            onChange={(event) => {
              update("city", event.target.value);
            }}
          />
        </Field>
        <Field label="State / region">
          <TextInput
            value={values.region}
            autoComplete="address-level1"
            onChange={(event) => {
              update("region", event.target.value);
            }}
          />
        </Field>
      </div>
      <Field label="Description">
        <TextArea
          rows={3}
          value={values.description}
          onChange={(event) => {
            update("description", event.target.value);
          }}
        />
      </Field>
    </FormDialog>
  );
}
