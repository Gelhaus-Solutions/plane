/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useForm } from "react-hook-form";
// plane imports
import { Button } from "@makeplane/propel/components/button";
import { InputField } from "@makeplane/propel/components/input-field";
import type { IInstance, IInstanceAdmin } from "@plane/types";
// components
import { ControllerInput } from "@/components/common/controller-input";
import { setToast } from "@plane/blocks/toast";
// hooks
import { useInstance } from "@/hooks/store";

export interface IGeneralConfigurationForm {
  instance: IInstance;
  instanceAdmins: IInstanceAdmin[];
}

export const GeneralConfigurationForm = observer(function GeneralConfigurationForm(props: IGeneralConfigurationForm) {
  const { instance, instanceAdmins } = props;
  // hooks
  const { updateInstanceInfo } = useInstance();

  // form data
  const {
    handleSubmit,
    control,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<Partial<IInstance>>({
    defaultValues: {
      instance_name: instance?.instance_name,
    },
  });

  const onSubmit = async (formData: Partial<IInstance>) => {
    const payload: Partial<IInstance> = { ...formData };

    try {
      await updateInstanceInfo(payload);
      // the saved values become the new baseline, so Save disables again until the next edit
      reset(formData);
      setToast({
        type: "success",
        title: "Success",
        message: "Settings updated successfully",
      });
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div className="text-body-md-medium text-primary">Instance details</div>
        <div className="grid-col grid w-full grid-cols-1 items-center justify-between gap-8 md:grid-cols-2 lg:grid-cols-3">
          <ControllerInput
            key="instance_name"
            name="instance_name"
            control={control}
            type="text"
            label="Name of instance"
            placeholder="Instance name"
            error={Boolean(errors.instance_name)}
            required
          />

          <InputField
            id="email"
            name="email"
            type="email"
            size="lg"
            orientation="vertical"
            label="Email"
            value={instanceAdmins[0]?.user_detail?.email ?? ""}
            placeholder="Admin email"
            autoComplete="on"
            disabled
          />

          <InputField
            id="instance_id"
            name="instance_id"
            type="text"
            size="lg"
            orientation="vertical"
            label="Instance ID"
            value={instance.instance_id}
            disabled
          />
        </div>
      </div>

      <div>
        <Button
          variant="primary"
          size="md"
          stretch="auto"
          onClick={() => {
            void handleSubmit(onSubmit)();
          }}
          loading={isSubmitting}
          disabled={!isDirty}
          label={isSubmitting ? "Saving" : "Save changes"}
        />
      </div>
    </div>
  );
});
