"""Hugging Face Space for piiguard (Gradio). Deployed by .github/workflows/deploy-space.yml."""
import gradio as gr
from piiguard import MODES, find, _apply

EXAMPLES = [
    "Hi team, my name is Sarah Johnson and I can't log in. Reach me at sarah.johnson@example.com or 6626341142.",
    "New hire Priya Raman: SSN 123-45-6789, card 4111 1111 1111 1111, laptop IP 192.168.4.27.",
    "Hola, soy María García López. Mi IBAN es ES91 2100 0418 4502 0005 1332 y mi pasaporte es PAA123456.",
    "aws_access_key_id = AKIAIOSFODNN7EXAMPLE  # please rotate this",
]


def run(text, mode, min_score):
    ents = find(text, min_score)
    redacted, key = _apply(text, ents, mode)
    pos = 0
    spans = []
    for e in ents:
        spans += [(text[pos:e.start], None), (e.text, e.type)]
        pos = e.end
    spans.append((text[pos:], None))
    table = [[e.type, e.text, round(e.score, 2), e.rule or ""] for e in ents]
    return spans, redacted, table


with gr.Blocks(title="piiguard: redact personal data") as demo:
    gr.Markdown("# piiguard\nFind and redact personal data. `pip install piiguard` · "
                "[docs](https://chadtollison.github.io/piiguard/) · runs locally in your own code")
    with gr.Row():
        with gr.Column():
            text = gr.Textbox(label="Text", lines=6, value=EXAMPLES[0])
            mode = gr.Radio(list(MODES), value="label", label="Redact as")
            min_score = gr.Slider(0.3, 0.95, value=0.5, step=0.05, label="Confidence needed")
            go = gr.Button("Redact", variant="primary")
        with gr.Column():
            hl = gr.HighlightedText(label="What it found")
            out = gr.Textbox(label="Redacted", lines=6, show_copy_button=True)
    table = gr.Dataframe(headers=["Type", "Text", "Score", "Rule"], label="Details")
    gr.Examples(EXAMPLES, inputs=text)
    go.click(run, [text, mode, min_score], [hl, out, table])
    text.submit(run, [text, mode, min_score], [hl, out, table])

if __name__ == "__main__":
    demo.launch()
