# rifft-autogen

AutoGen adapter for [Rifft](https://github.com/rifft-dev/rifft).

`rifft-autogen` instruments AutoGen chats and team orchestration so agent communication and failure cascades show up in Rifft.

## Install

```bash
pip install rifft-sdk rifft-autogen
```

## Usage

```python
import rifft
import rifft.adapters.autogen

rifft.init(service_name="my-autogen-app")
rifft.adapters.autogen.instrument()
```

Then run your AutoGen workflow normally and inspect the resulting trace in Rifft.
