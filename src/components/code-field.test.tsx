import { render, screen, userEvent } from '@testing-library/react-native';
import { useState } from 'react';
import { Platform } from 'react-native';

import { CodeField } from '@/components/code-field';

/** A form's use of the field: it keeps what the field hands it. */
function Form({ onCode }: { onCode?: (code: string) => void }) {
  const [code, setCode] = useState('');
  return (
    <CodeField
      label="Code"
      hint="The 8 digits from the email."
      value={code}
      length={8}
      onChangeText={(next) => {
        setCode(next);
        onCode?.(next);
      }}
    />
  );
}

const field = () => screen.getByLabelText('Code');

const DEFAULT_OS = Platform.OS;

afterEach(() => {
  Platform.OS = DEFAULT_OS;
});

describe('CodeField', () => {
  /**
   * The number pad, and the offer to fill the code in from the message it came
   * in, as each platform names it: textContentType on iOS; on Android the
   * autoComplete value React Native 0.86 passes on as AUTOFILL_HINT_SMS_OTP
   * (ReactTextInputManager); on the web the HTML autocomplete value.
   */
  it('asks iOS for the number pad and the code from the message', async () => {
    Platform.OS = 'ios';
    await render(<Form />);

    expect(field()).toHaveProp('keyboardType', 'number-pad');
    expect(field()).toHaveProp('textContentType', 'oneTimeCode');
    expect(field()).toHaveProp('autoCorrect', false);
  });

  it('asks Android for the number pad and its autofill of codes', async () => {
    Platform.OS = 'android';
    await render(<Form />);

    expect(field()).toHaveProp('keyboardType', 'number-pad');
    expect(field()).toHaveProp('autoComplete', 'sms-otp');
  });

  it('asks a browser for the code by the web’s name for it', async () => {
    Platform.OS = 'web';
    await render(<Form />);

    expect(field()).toHaveProp('autoComplete', 'one-time-code');
  });

  it('keeps the digits of a code typed with a space in it', async () => {
    const user = userEvent.setup();
    await render(<Form />);

    await user.type(field(), '1234 5678');

    expect(field()).toHaveProp('value', '12345678');
  });

  /**
   * Pasted from the email, the code comes with the words around it, and some
   * mail apps space its digits: only the digits are the code. A limit on the
   * field's length would cut a spaced code short before it got here.
   */
  it('takes only the digits of what is pasted, as many as a code has', async () => {
    const user = userEvent.setup();
    const onCode = jest.fn();
    await render(<Form onCode={onCode} />);

    await user.paste(field(), 'Your Night Courier code is 7348 3481');

    expect(field()).toHaveProp('value', '73483481');
    expect(onCode).toHaveBeenLastCalledWith('73483481');
    expect(field()).not.toHaveProp('maxLength', expect.anything());
  });

  /**
   * What the field asks of the keyboard and of autofill are its defaults: a
   * form that asks otherwise is listened to, not overruled without a word.
   * (Found in review: the order that decides this had no test.)
   */
  it('takes what a form asks for over its own defaults', async () => {
    Platform.OS = 'ios';
    await render(
      <CodeField
        label="Code"
        value=""
        length={8}
        onChangeText={() => {}}
        keyboardType="numeric"
        textContentType="none"
        autoComplete="off"
      />,
    );

    expect(field()).toHaveProp('keyboardType', 'numeric');
    expect(field()).toHaveProp('textContentType', 'none');
    expect(field()).toHaveProp('autoComplete', 'off');
  });

  it('stops at the length of a code', async () => {
    const user = userEvent.setup();
    await render(<Form />);

    await user.type(field(), '1234567890');

    expect(field()).toHaveProp('value', '12345678');
  });
});
