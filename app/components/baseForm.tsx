import { TextInput, Group, Button, Select } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useNavigate } from '@remix-run/react';

interface Props {
  fields: FieldsConfig[];
  validation?: object;
  onSubmit?: (values: Record<string, string>) => void; // TODO: Remove the optional after testing
  submitLabel?: string;
  method?: 'post' | 'get';
  action?: string;
}

interface FieldsConfig {
  name: string;
  label: string;
  placeholder?: string;
  type?: 'text' | 'select';
  required?: boolean;
  data?: string[];
}

export function BaseForm({
  fields,
  validation,
  onSubmit = values => console.log(values),
  submitLabel = 'Submit',
  method = 'post',
  action,
}: Props) {
  const initialValues = fields.reduce((acc, field) => {
    acc[field.name] = '';
    return acc;
  }, {} as Record<string, string>);

  const form = useForm({
    mode: 'uncontrolled',
    initialValues,
    validate: validation,
  });

  return (
    <form method={method} action={action} onSubmit={form.onSubmit(onSubmit)}>
      {fields.map(field => {
        if (field.type === 'select') {
          return (
            <Select
              key={field.name}
              label={field.label}
              allowDeselect={false}
              required={field.required}
              data={field.data}
              {...form.getInputProps(field.name)}
              mb='sm'
            />
          );
        }
        return (
          <TextInput
            key={field.name}
            label={field.label}
            placeholder={field.placeholder}
            required={field.required}
            {...form.getInputProps(field.name)}
            mb='sm'
          />
        );
      })}

      <Group justify='flex-end' mt='md'>
        <Button type='submit'>{submitLabel}</Button>
      </Group>
    </form>
  );
}
